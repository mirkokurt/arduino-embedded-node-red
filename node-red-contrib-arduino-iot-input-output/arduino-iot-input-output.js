module.exports = function(RED) {
  function ArduinoIotInputOutput(config) {
      RED.nodes.createNode(this, config);
      var node = this;
      const ArdarduinCloudMessageClient = RED.settings.functionGlobalContext.ArduinoMessageClient;
      if (ArdarduinCloudMessageClient) {
        node.on('input', function(msg) {
          const timestamp =   (new Date()).getTime();
          ArdarduinCloudMessageClient.sendProperty(config.thing, config.property, msg.payload, timestamp).then(() => {
            const timestamp = (new Date()).getTime();
            node.send(
              {
                topic: config.property,
                payload: msg.payload,
                timestamp: timestamp
              }            
            );
          });
      });
      }
  }
  RED.nodes.registerType("Property-in-out", ArduinoIotInputOutput);
}
