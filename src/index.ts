import sensibo from './lib/sensiboapi';
import { Config } from './lib/config';
import { Logger, LogFunction } from './types/logger';
import createSensiboPodAccessory from './accessories/pods';

let SensiboPodAccessory: any;

export class SensiboPlatform {
  apiKey: string;
  sensibo: typeof sensibo;
  log: Logger;
  debug: LogFunction;

  constructor(log: Logger, config: Config) {
    this.apiKey = config.apiKey;
    this.sensibo = sensibo;
    this.log = log;
    this.debug = log.debug;
  }

  accessories(callback: (accessories: any[]) => void) {
    this.log('Fetching Sensibo devices...');

    const foundAccessories: any[] = [];

    sensibo.init(this.apiKey);
    sensibo.getPods((devices) => {
      if (devices != null) {
        for (let i = 0; i < devices.length; i++) {
          const device = devices[i];

          const accessory = new SensiboPodAccessory(this, device);

          if (accessory !== undefined) {
            this.log(
              'Device Added (Name: %s, ID: %s, Group: %s)',
              accessory.name,
              accessory.deviceid,
              accessory.deviceGroup,
            );
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
