module.exports = function(RED) {
  "use strict";
  var cron = require("cron");

  function ArduinoIotInputApi(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    this.repeat = config.repeat;
    this.crontab = config.crontab;
    this.crontab = config.crontab;
    this.once = config.once;
    this.onceDelay = (config.onceDelay || 0.1) * 1000;
    this.interval_id = null;
    this.cronjob = null;

    if (node.repeat > 2147483) {
      node.error(RED._("inject.errors.toolong", this));
      delete node.repeat;
    }

    node.repeaterSetup = function () {
      if (this.repeat && !isNaN(this.repeat) && this.repeat > 0) {
        this.repeat = this.repeat * 1000;
        if (RED.settings.verbose) {
          this.log(RED._("inject.repeat", this));
        }
        this.interval_id = setInterval(function() {
          console.log("interval activated");
          node.emit("input", {});
        }, this.repeat);
      } else if (this.crontab) {
        if (RED.settings.verbose) {
          this.log(RED._("inject.crontab", this));
        }
        this.cronjob = new cron.CronJob(this.crontab, function() { 
          node.emit("input", {});
          console.log("cron job activated");
        }, null, true);
      }
    };

    if (this.once) {
      this.onceTimeout = setTimeout( function() {
        node.emit("input",{});
        node.repeaterSetup();
      }, this.onceDelay);
    } else {
      node.repeaterSetup();
    }

    const ArdarduinCloudRESTClient = RED.settings.functionGlobalContext.ArduinoRestClient;
    if (ArdarduinCloudRESTClient) {
      node.on('input', function() {
        //console.log("api activated");
        ArdarduinCloudRESTClient.getProperty(config.thing, config.propid).then( (result) => {
          //console.log("result: " + JSON.stringify(result));
          const timestamp = (new Date()).getTime();
          node.send(
            {
              topic: config.name,
              payload: result.last_value,
              timestamp: timestamp
            }  
          );
        });
      });
      node.on('close', function() {
        if (this.onceTimeout) {
            clearTimeout(this.onceTimeout);
        }
        if (this.interval_id != null) {
            clearInterval(this.interval_id);
            if (RED.settings.verbose) { this.log(RED._("inject.stopped")); }
        } else if (this.cronjob != null) {
            this.cronjob.stop();
            if (RED.settings.verbose) { this.log(RED._("inject.stopped")); }
            delete this.cronjob;
        }
      });
    }
  }
  RED.nodes.registerType("Property-in-api", ArduinoIotInputApi);
}
