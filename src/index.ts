import { SensiboClient } from './lib/sensiboClient';
import { Config } from './lib/config';
import { Logger } from './types/logger';
import createSensiboPodAccessory from './accessories/pods';

export class SensiboPlatform {
  sensiboClient: SensiboClient;

  constructor(
    readonly log: Logger,
    readonly config: Config,
    readonly homebridgeApi: any,
  ) {
    this.sensiboClient = new SensiboClient(config.apiKey);
  }

  accessories(callback: (accessories: any[]) => void) {
    this.log('Fetching Sensibo devices...');

    const SensiboPodAccessory = createSensiboPodAccessory(
      this.homebridgeApi.hap,
    );

    this.sensiboClient
      .getPods()
      .then((devices) => {
        if (!devices) {
          this.log(
            'No Senisbo devices returned from Sensibo server! Please check your API key.',
          );

          callback([]);
          return;
        }

        const foundAccessories = devices.map((device) => {
          const accessory = new SensiboPodAccessory(this, device);

          this.log(
            'Device Added (Name: %s, ID: %s, Group: %s)',
            accessory.name,
            accessory.deviceId,
            accessory.deviceGroup,
          );

          return accessory;
        });

        callback(foundAccessories);
      })
      .catch((err) => this.log.warn(err));
  }
}

module.exports = (homebridge: any) => {
  homebridge.registerPlatform(
    'homebridge-sensibo-sky',
    'SensiboSky',
    SensiboPlatform,
  );
};
