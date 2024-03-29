module.exports = function(RED) {
  function ArduinoIotInput(config) {
      RED.nodes.createNode(this, config);
      var node = this;
      const ArdarduinCloudMessageClient = RED.settings.functionGlobalContext.ArduinoMessageClient;
      if (ArdarduinCloudMessageClient) {
        ArdarduinCloudMessageClient.onPropertyValue(config.thing, config.property, message => {
          const timestamp = (new Date()).getTime();
          node.send(
            {
              topic: config.property,
              payload: message,
              timestamp: timestamp
            }            
          );
        }).then(() => {
          node.on('close', function(done) {
            ArdarduinCloudMessageClient.removePropertyValueCallback(config.thing, config.property).then( () => {
              done();
            });
          });
        });
      }
  }
  RED.nodes.registerType("Property-in", ArduinoIotInput);
}
