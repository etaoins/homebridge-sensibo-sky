import type * as Homebridge from 'homebridge';

import { SensiboClient } from './lib/sensiboClient';
import { Config } from './lib/config';
import { SensiboPodAccessory } from './accessories/pods';

export class SensiboPlatform implements Homebridge.StaticPlatformPlugin {
  sensiboClient: SensiboClient;
  readonly config: Config;

  constructor(
    readonly log: Homebridge.Logging,
    platformConfig: Homebridge.PlatformConfig,
    readonly homebridgeApi: Homebridge.API,
  ) {
    // TODO: Validate config
    this.config = (platformConfig as any) as Config;
    this.sensiboClient = new SensiboClient(this.config.apiKey);
  }

  accessories(
    callback: (accessories: Homebridge.AccessoryPlugin[]) => void,
  ): void {
    this.log('Fetching Sensibo devices...');

    const fetchAccessories = () => {
      const MAX_RETRY_DELAY_SECS = 80;
      let retryDelaySecs = 5;

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
            const accessory = new SensiboPodAccessory(
              this.homebridgeApi.hap,
              this,
              device,
            );

            this.log(
              'Device Added (Name: %s, ID: %s)',
              accessory.name,
              accessory.deviceId,
            );

            return accessory;
          });

          callback(foundAccessories);
        })
        .catch((err) => {
          this.log.warn(err);

          this.log(`Retrying in ${retryDelaySecs} seconds`);
          global.setTimeout(fetchAccessories, retryDelaySecs * 1000);

          retryDelaySecs = Math.min(retryDelaySecs * 2, MAX_RETRY_DELAY_SECS);
        });
    };

    fetchAccessories();
  }
}

module.exports = (homebridge: Homebridge.API) => {
  homebridge.registerPlatform(
    'homebridge-sensibo-sky',
    'SensiboSky',
    SensiboPlatform,
  );
};
