import sensibo from './lib/sensiboapi';
import createSensiboPodAccessory from './accessories/pods';

let SensiboPodAccessory: any;

class SensiboPlatform {
  apiKey: string;
  apiDebug: boolean;
  temperatureUnit: 'C' | 'F';
  api: typeof sensibo;
  log: Function;
  debug: Function;
  deviceLookup: any[];

  constructor(log: any, config: any) {
    this.apiKey = config.apiKey;
    this.apiDebug = config.apiDebug;
    this.temperatureUnit = config.temperatureUnit;
    this.api = sensibo;
    this.log = log;
    this.debug = log.debug;
    this.deviceLookup = [];
  }

  accessories(callback: (accessories: any[]) => void) {
    this.log('Fetching Sensibo devices...');

    const foundAccessories: any[] = [];
    this.deviceLookup = [];

    sensibo.init(this.apiKey);
    sensibo.getPods((devices) => {
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
    });
  }
}

module.exports = function (homebridge: any) {
  SensiboPodAccessory = createSensiboPodAccessory(homebridge.hap);

  homebridge.registerPlatform(
    'homebridge-sensibo-sky',
    'SensiboSky',
    SensiboPlatform,
  );
};
