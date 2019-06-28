const http = require('http');
const os = require('os');
const express = require("express");
const RED = require("node-red");
let REDisRunning = false;
const ClientOAuth2 = require('client-oauth2');
const session = require('express-session')
const MemoryStore = require('memorystore')(session)
const fs = require('fs');
const arduinCloudRestApi = require('./arduino-cloud-api');
require("babel-polyfill");
const arduinCloudMessageApi = require('arduino-iot-js').default;
const Fetch = require('node-fetch').default;
const fetch = Fetch.default;
const Headers = Fetch.Headers;
global["fetch"] = fetch;
global["Headers"] = Headers;
const WebSocket = require('ws');	
global["WebSocket"] = WebSocket;

const clientId = process.env.NODE_RED_CLIENT_ID || 'node-red';
const clientSecret = process.env.NODE_RED_CLIENT_SECRET || 'gT4jLtBC48BC3WfUpgLjSugwak7KjHjD';
const accessTokenUri = process.env.NODE_RED_ACCESS_TOKEN_URI || 'https://hydra-dev.arduino.cc/oauth2/token';
const authorizationUri = process.env.NODE_RED_AUTHORIZATION_URI || 'https://hydra-dev.arduino.cc/oauth2/auth';
const redirectUri = process.env.NODE_RED_REDIRECT_URI || 'http://localhost:8080/oauth/redirect';


let ArduinoOAuthClient = new ClientOAuth2({
  clientId: clientId,
  clientSecret: clientSecret,
  accessTokenUri: accessTokenUri,
  authorizationUri: authorizationUri,
  redirectUri: redirectUri,
  state: randomString(8),
  scopes: ['profile:core', 'iot:devices', 'iot:things', 'iot:properties', 'offline'],
  access_type : 'code'
})

function randomString(len) {
  return [...Array(len)].map(i => (~~(Math.random() * 36)).toString(36)).join('');
}

// Create an Express app
var app = express();

app.use(session({
  cookie: { maxAge: 86400000 },
  store: new MemoryStore({
    checkPeriod: 86400000 // prune expired entries every 24h
  }),  secret: 'Arduino IoT',
  resave: true,
  saveUninitialized: false
}))

const homeDir = os.homedir();
var settings = {
  httpAdminRoot:"/red",
  httpNodeRoot: "/api",
  userDir:homeDir + "/.nodered/",
  functionGlobalContext: { 
  },   // enables global context
  credentialSecret: "Arduino IoT",
  editorTheme: {
    projects: {
        enabled: true
    }
  }
};

// Create a server
var server = http.createServer(app);

// Initialise the runtime with a server and settings
RED.init(server, settings);

app.get('/oauth/redirect', function (req, res) {
  ArduinoOAuthClient.code.getToken(req.originalUrl)
    .then(function (user) {
      req.session.user = {
        accessToken: user.accessToken,
        refreshToken: user.refreshToken
      };
      fs.writeFile(homeDir + '/.nodered/oauth.json', JSON.stringify(user.data), 'utf8', (err, data) => {
        if (err) 
          console.log("writeFile error: " + err);
      });
      if (RED.settings.functionGlobalContext.ArduinoMessageClient) {
        RED.settings.functionGlobalContext.ArduinoRestClient.getUserId()
        .then( u => {
          req.session.user.id = u.id;
          req.session.user.username=  u.username;
        });
        return res.redirect('/red');
      }
      initArduinoClients(user, RED)
      .then( () => {
        RED.settings.functionGlobalContext.ArduinoRestClient.getUserId()
        .then( u => {
          req.session.user.id = u.id;
          req.session.user.username=  u.username;
        });
        // Start the runtime
        if (!REDisRunning) {
          REDisRunning = true;
          RED.start().then(() => {
            return res.redirect('/red');
          });
        } else {
          return res.redirect('/red');          
        } 
      });
    })
    .catch(err => {
      return res.code(404).end();
    })
})

const mqttHost = process.env.IOT_MQTTHOST_URL || 'wss.iot.oniudra.cc';
const authApiUrl = process.env.IOT_MQTTHOST_URL || 'https://auth-dev.arduino.cc';

ArduinoCloudOptions = {
  host: mqttHost,
  port: 8443,
  ssl: true,             
  apiUrl: authApiUrl,
  useCloudProtocolV2: true
}

fs.readFile(homeDir + '/.nodered/oauth.json', 'utf8', (err, data) => {
  if (!err){
    const pData = JSON.parse(data);
    ArduinoOAuthClient.createToken(pData.access_token, pData.refresh_token, pData.token_type, pData).refresh()
    .then(updatedUser => {
      fs.writeFile(homeDir + '/.nodered/oauth.json', JSON.stringify(updatedUser.data), 'utf8', (err, data) => {
        if (err)
          console.log(err);
      });
      initArduinoClients(updatedUser, RED)
      .then( () => {
        // Start the runtime
        if (!REDisRunning) {
          REDisRunning = true;
          RED.start();
        }
      });
    })
    .catch(err => {
      console.log("createToken error:" + err);
    });
  }
});

async function initArduinoClients(u, r) {
  ArduinoCloudOptions.token = u.accessToken;
  r.settings.functionGlobalContext.ArduinoRestClient = new arduinCloudRestApi.ArduinoCloudClient(u.accessToken);
  try {
    await arduinCloudMessageApi.connect(ArduinoCloudOptions);
    r.settings.functionGlobalContext.ArduinoMessageClient = arduinCloudMessageApi;
  } catch ( err ) {
    console.log("initArduinoClients error:" + err);
  };
  // Manage the expiration of the token
  setTimeout(() => {
    ArduinoOAuthClient.createToken(u.data.access_token, u.data.refresh_token, u.data.token_type, u.data).refresh()
    .then(updatedUser => {
      r.settings.functionGlobalContext.ArduinoRestClient.updateToken(updatedUser.data.access_token);
      r.settings.functionGlobalContext.ArduinoMessageClient.updateToken(updatedUser.data.access_token);
      fs.writeFile('/Users/andreacatozzi/.nodered/oauth.json', JSON.stringify(updatedUser.data), 'utf8', (err, data) => {
        if (err)
          console.log(err);
      });
    });
  }, (u.data.expires_in - 60) * 1000);

}

// Serve the editor UI from /red
app.use(settings.httpAdminRoot, function (req, res, next) {
  if (req.session.user) {
    return next();
  } 
  var uri = ArduinoOAuthClient.code.getUri();
  if (req.url == "/comms" || req.xhr)
    return next();
  else
    return res.redirect(uri)
}, RED.httpAdmin);

// Serve the http nodes UI from /api
app.use(settings.httpNodeRoot, RED.httpNode);

app.get('/red/things', function (req, res) {
  const ArduinoRestClient = RED.settings.functionGlobalContext.ArduinoRestClient;
  ArduinoRestClient.getThings()
  .then(things => {
    return res.send(JSON.stringify(things));
  }).catch(err => {
    console.log(err);
  });
})

app.get('/red/properties', function (req, res) {
  const thing_id = req.query.thing_id;
  const ArduinoRestClient = RED.settings.functionGlobalContext.ArduinoRestClient;
  ArduinoRestClient.getProperties(thing_id)
  .then(properties => {
    return res.send(JSON.stringify(properties));
  })
  .catch(err => {
    console.log(err);
  });
})

app.get('/*', function (req, res) {
  if (req.url == "/comms" || req.xhr) {
    return res.end();
  } else {
    return res.redirect('/red');
  }
})


server.listen(8080);