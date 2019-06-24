module.exports = function(RED) {
  function ArduinoIotOutput(config) {
      RED.nodes.createNode(this, config);
      var node = this;
      const ArdarduinCloudMessageClient = RED.settings.functionGlobalContext.ArduinoMessageClient;
      if (ArdarduinCloudMessageClient) {
        node.on('input', function(msg) {
          const timestamp =   (new Date()).getTime();
          ArdarduinCloudMessageClient.sendProperty(config.thing, config.property, msg.payload, timestamp).then(() => {
          });
      });
      }
  }
  RED.nodes.registerType("Property-out", ArduinoIotOutput);
}
