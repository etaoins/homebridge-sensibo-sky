const sensibo = require('./lib/sensiboapi');
let SensiboPodAccessory;

class SensiboPlatform {
  constructor(log, config) {
    this.apiKey = config.apiKey;
    this.apiDebug = config.apiDebug;
    this.temperatureUnit = config.temperatureUnit;
    this.api = sensibo;
    this.log = log;
    this.debug = log.debug;
    this.deviceLookup = {};
  }

  reloadData(_callback) {
    // This is called when we need to refresh all device information.
    this.debug('Refreshing Sensibo Data');
    for (let i = 0; i < this.deviceLookup.length; i++) {
      this.deviceLookup[i].loadData();
    }
  }

  accessories(callback) {
    this.log('Fetching Sensibo devices...');

    const foundAccessories = [];
    this.deviceLookup = [];

    sensibo.init(this.apiKey);
    sensibo.getPods((devices) => {
      // success

      if (devices != null) {
        for (let i = 0; i < devices.length; i++) {
          const device = devices[i];

          device.temperatureUnit = this.temperatureUnit;

          const accessory = new SensiboPodAccessory(this, device);

          if (accessory !== undefined) {
            this.log(
              'Device Added (Name: %s, ID: %s, Group: %s)',
              accessory.name,
              accessory.deviceid,
              accessory.deviceGroup,
            );
            this.deviceLookup.push(accessory);
            foundAccessories.push(accessory);
          }
        }
        callback(foundAccessories);
      } else {
        this.log(
          'No senisbo devices return from Sensibo server ! Please check your APIkey.',
        );
      }
      // refreshLoop();
    });
  }
}

module.exports = function (homebridge) {
  SensiboPodAccessory = require('./accessories/pods')(homebridge.hap);

  homebridge.registerPlatform(
    'homebridge-sensibo-sky',
    'SensiboSky',
    SensiboPlatform,
  );
};
