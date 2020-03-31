const sensibo = require('./lib/sensiboapi');
let SensiboPodAccessory;

module.exports = function (homebridge) {
  SensiboPodAccessory = require('./accessories/pods')(homebridge.hap);

  homebridge.registerPlatform(
    'homebridge-sensibo-sky',
    'SensiboSky',
    SensiboPlatform,
  );
};

function SensiboPlatform(log, config) {
  // Load Wink Authentication From Config File
  this.apiKey = config.apiKey;
  this.apiDebug = config.apiDebug;
  this.temperatureUnit = config.temperatureUnit;
  this.api = sensibo;
  this.log = log;
  this.debug = log.debug;
  this.deviceLookup = {};
}

SensiboPlatform.prototype = {
  reloadData(_callback) {
    // This is called when we need to refresh all device information.
    this.debug('Refreshing Sensibo Data');
    for (let i = 0; i < this.deviceLookup.length; i++) {
      this.deviceLookup[i].loadData();
    }
  },
  accessories(callback) {
    this.log('Fetching Sensibo devices...');

    const that = this;
    const foundAccessories = [];
    this.deviceLookup = [];

    sensibo.init(this.apiKey, this.debug);
    sensibo.getPods(that.log, function (devices) {
      // success

      if (devices != null) {
        for (let i = 0; i < devices.length; i++) {
          const device = devices[i];

          device.temperatureUnit = that.temperatureUnit;

          const accessory = new SensiboPodAccessory(that, device);

          if (accessory !== undefined) {
            that.log(
              'Device Added (Name: %s, ID: %s, Group: %s)',
              accessory.name,
              accessory.deviceid,
              accessory.deviceGroup,
            );
            that.deviceLookup.push(accessory);
            foundAccessories.push(accessory);
          }
        }
        callback(foundAccessories);
      } else {
        that.log(
          'No senisbo devices return from Sensibo server ! Please check your APIkey.',
        );
      }
      // refreshLoop();
    });
  },
};
