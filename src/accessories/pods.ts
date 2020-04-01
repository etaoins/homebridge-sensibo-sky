import { calculateDesiredAcState } from '../lib/autoMode';
import { acStatesEquivalent, AcState } from '../lib/acState';
import { Device } from '../lib/device';
import { Logger } from '../types/logger';
import { Measurement } from '../lib/measurement';
import {
  saveUserState,
  restoreUserState,
  userStatesEquivalent,
  UserState,
} from '../lib/userState';
import {
  SENSIBO_TEMPERATURE_RANGE,
  TARGET_TEMPERATURE_RANGE,
  clampTemperature,
  fahrenheitToCelsius,
} from '../lib/temperature';
import type { SensiboPlatform } from '../index';

const stateTimeout = 30000; // in ms to min time elapse to call for refresh
const tempTimeout = 10000; // in ms to min time elapse before next call for refresh

function heatingCoolingStateForAcState(acState: AcState, characteristic: any) {
  if (acState.on === false) {
    return characteristic.OFF;
  }

  switch (acState.mode) {
    case 'cool':
      return characteristic.COOL;
    case 'heat':
      return characteristic.HEAT;
    case 'fan':
    default:
      return characteristic.OFF;
  }
}

// Pod Accessory
export default (hap: any) => {
  const { Service, Characteristic, Accessory, uuid } = hap;

  return class SensiboPodAccessory extends Accessory {
    deviceGroup: string;
    deviceid: string;
    platform: SensiboPlatform;
    log: Logger;

    acState: AcState & { updateTime?: Date };
    temp: Measurement & { updateTime?: Date };
    userState: UserState;

    constructor(platform: SensiboPlatform, device: Device) {
      const id = uuid.generate(`hbdev:sensibo:pod:${device.id}`);
      super(device.room.name, id);

      this.deviceGroup = 'pods';
      this.deviceid = device.id;
      this.name = device.room.name;
      this.platform = platform;
      this.log = platform.log;

      // HomeKit does really strange things since we have to wait on the data to get populated
      // This is just intro information. It will be corrected in a couple of seconds.
      this.acState = {
        temperatureUnit: 'C',
        targetTemperature: 20,
        on: false,
        mode: 'cool',
        fanLevel: 'auto',
      };

      this.temp = {
        temperature: 20,
        humidity: 0,
      };

      this.userState = restoreUserState(this.platform.config, this.deviceid);

      // AccessoryInformation characteristic
      // Manufacturer characteristic
      this.getService(Service.AccessoryInformation).setCharacteristic(
        Characteristic.Manufacturer,
        'homebridge-sensibo-sky',
      );

      // Model characteristic
      this.getService(Service.AccessoryInformation).setCharacteristic(
        Characteristic.Model,
        'version 0.2.1',
      );

      // SerialNumber characteristic
      this.getService(Service.AccessoryInformation).setCharacteristic(
        Characteristic.SerialNumber,
        `Pod ID: ${this.deviceid}`,
      );

      // Master switch
      this.addService(Service.Switch, 'Split Unit', 'Power')
        .getCharacteristic(Characteristic.On)
        .on('set', (value: any, callback: () => void) => {
          if (value === this.userState.masterSwitch) {
            callback();
            return;
          }

          if (value) {
            this.log('Turning master switch on');
            this.updateUserState({ masterSwitch: true }, callback);
          } else {
            this.log('Turning master switch off');
            this.updateUserState({ masterSwitch: false }, callback);
          }
        });

      // Thermostat Service
      const thermostatService = this.addService(Service.Thermostat);

      // Current Temperature characteristic
      thermostatService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          unit: Characteristic.Units.CELSIUS,
          minStep: 0.1,
          perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
        });

      // Target Heating/Cooling Mode characteristic
      thermostatService
        .getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .on('set', (value: any, callback: () => void) => {
          switch (value) {
            case Characteristic.TargetHeatingCoolingState.COOL:
              this.log('Setting target heating mode to cool');

              this.updateUserState({ autoMode: false });
              this.updateAcState({ on: true, mode: 'cool' }, callback);

              break;
            case Characteristic.TargetHeatingCoolingState.HEAT:
              this.log('Setting target heating mode to heat');

              this.updateUserState({ autoMode: false });
              this.updateAcState({ on: true, mode: 'heat' }, callback);

              break;
            case Characteristic.TargetHeatingCoolingState.AUTO:
              this.log('Setting target heating mode to auto');
              this.updateUserState({ autoMode: true }, callback);

              break;

            case Characteristic.TargetHeatingCoolingState.OFF:
            default:
              this.log('Setting target heating mode to off');

              this.updateUserState({ autoMode: false });
              this.updateAcState({ mode: 'fan' }, callback);

              break;
          }
        });

      const commonTemperatureProps = {
        format: Characteristic.Formats.FLOAT,
        unit: Characteristic.Units.CELSIUS,
        perms: [
          Characteristic.Perms.READ,
          Characteristic.Perms.WRITE,
          Characteristic.Perms.NOTIFY,
        ],
      };

      // Target Temperature characteristic
      thermostatService
        .getCharacteristic(Characteristic.TargetTemperature)
        .setProps({ ...commonTemperatureProps, ...SENSIBO_TEMPERATURE_RANGE })
        .on('set', (value: any, callback: () => void) => {
          this.log(`Setting target temperature: ${value}`);

          this.updateUserState(
            {
              targetTemperature: clampTemperature(
                value,
                SENSIBO_TEMPERATURE_RANGE,
              ),
            },
            callback,
          );
        });

      // Heating Threshold Temperature Characteristic
      thermostatService
        .getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .setProps({ ...commonTemperatureProps, ...TARGET_TEMPERATURE_RANGE })
        .on('set', (value: any, callback: () => void) => {
          this.log(`Setting heating threshold: ${value}`);

          this.updateUserState(
            {
              heatingThresholdTemperature: clampTemperature(
                value,
                TARGET_TEMPERATURE_RANGE,
              ),
            },
            callback,
          );
        });

      // Cooling Threshold Temperature Characteristic
      thermostatService
        .getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .setProps({ ...commonTemperatureProps, ...TARGET_TEMPERATURE_RANGE })
        .on('set', (value: any, callback: () => void) => {
          this.log(`Setting cooling threshold: ${value}`);

          this.updateUserState(
            {
              coolingThresholdTemperature: clampTemperature(
                value,
                TARGET_TEMPERATURE_RANGE,
              ),
            },
            callback,
          );
        });

      // Humidity sensor service
      this.addService(Service.HumiditySensor);

      this.loadData();
      setInterval(this.loadData.bind(this), 30000);
    }

    loadData(callback?: () => void): void {
      this.refreshState(() =>
        this.refreshTemperature(() => this.updateAcState({}, callback)),
      );
    }

    getServices(): any[] {
      return this.services;
    }

    refreshState(callback?: () => void): void {
      // This prevents this from running more often
      const rightnow = new Date();

      if (
        this.acState.updateTime &&
        rightnow.getTime() - this.acState.updateTime.getTime() < stateTimeout
      ) {
        if (callback) {
          callback();
        }
        return;
      }
      if (!this.acState.updateTime) {
        this.acState.updateTime = rightnow;
      }

      // Update the state
      this.platform.sensibo.getState(this.deviceid, (acState?: AcState) => {
        if (acState) {
          this.applyServerState(acState);

          if (callback) {
            callback();
          }
        }
      });
    }

    refreshTemperature(callback?: () => void): void {
      // This prevents this from running more often
      const rightnow = new Date();

      if (
        this.temp.updateTime &&
        rightnow.getTime() - this.temp.updateTime.getTime() < tempTimeout
      ) {
        if (callback) {
          callback();
        }
        return;
      }
      if (!this.temp.updateTime) {
        this.acState.updateTime = rightnow;
      }

      // Update the temperature
      this.platform.sensibo.getMeasurements(
        this.deviceid,
        (data?: Measurement[]) => {
          if (data && data.length > 0) {
            this.temp.temperature = data[0].temperature;
            this.getService(Service.Thermostat).updateCharacteristic(
              Characteristic.CurrentTemperature,
              this.temp.temperature,
            );

            this.temp.humidity = data[0].humidity;
            this.getService(Service.HumiditySensor).updateCharacteristic(
              Characteristic.CurrentRelativeHumidity,
              Math.round(this.temp.humidity),
            );

            this.temp.updateTime = new Date(); // Set our last update time.
          }
          if (callback) {
            callback();
          }
        },
      );
    }

    identify(): void {
      this.log('Identify! (name: %s)', this.name);
    }

    applyServerState(acState: AcState): void {
      this.acState.temperatureUnit = acState.temperatureUnit;

      const newTargetTemperature =
        this.acState.temperatureUnit === 'F'
          ? fahrenheitToCelsius(acState.targetTemperature)
          : acState.targetTemperature;

      if (this.acState.on !== acState.on) {
        if (acState.on) {
          this.log('Externally turned on');
          this.acState.on = true;
        } else {
          this.log('Externally turned off');
          this.acState.on = false;
        }
      }

      if (this.acState.targetTemperature !== newTargetTemperature) {
        if (acState.on) {
          this.log(
            'Target temperature externally changed from %s to %s',
            this.acState.targetTemperature,
            newTargetTemperature,
          );
        }

        this.acState.targetTemperature = newTargetTemperature;
      }

      if (this.acState.mode !== acState.mode) {
        if (acState.on) {
          this.log(
            'Mode externally changed from %s to %s',
            this.acState.mode,
            acState.mode,
          );
        }

        this.acState.mode = acState.mode;
      }

      this.acState.fanLevel = acState.fanLevel;
      this.acState.updateTime = new Date(); // Set our last update time.

      if (!this.userState.autoMode) {
        this.userState.targetTemperature = this.acState.targetTemperature;
      }

      this.updateCharacteristicsFromAcState(acState, this.userState);
    }

    updateCharacteristicsForAutoMode(userState: UserState): void {
      const masterSwitchService = this.getService(Service.Switch);
      masterSwitchService.updateCharacteristic(
        Characteristic.On,
        userState.masterSwitch,
      );

      const thermostatService = this.getService(Service.Thermostat);

      thermostatService.updateCharacteristic(
        Characteristic.TargetHeatingCoolingState,
        Characteristic.TargetHeatingCoolingState.AUTO,
      );

      thermostatService.updateCharacteristic(
        Characteristic.TargetTemperature,
        userState.targetTemperature,
      );
    }

    updateCharacteristicsForManualMode(
      acState: AcState,
      userState: UserState,
    ): void {
      const masterSwitchService = this.getService(Service.Switch);
      masterSwitchService.updateCharacteristic(
        Characteristic.On,
        userState.masterSwitch && acState.on,
      );

      const thermostatService = this.getService(Service.Thermostat);

      thermostatService.updateCharacteristic(
        Characteristic.TargetHeatingCoolingState,
        heatingCoolingStateForAcState(
          acState,
          Characteristic.TargetHeatingCoolingState,
        ),
      );

      thermostatService.updateCharacteristic(
        Characteristic.TargetTemperature,
        acState.targetTemperature,
      );
    }

    updateCharacteristicsFromAcState(
      acState: AcState,
      userState: UserState,
    ): void {
      const thermostatService = this.getService(Service.Thermostat);

      // Current heating/cooling state
      thermostatService.updateCharacteristic(
        Characteristic.CurrentHeatingCoolingState,
        heatingCoolingStateForAcState(
          acState,
          Characteristic.CurrentHeatingCoolingState,
        ),
      );

      // Temperature Display Units characteristic
      thermostatService.updateCharacteristic(
        Characteristic.TemperatureDisplayUnits,
        acState.temperatureUnit === 'F'
          ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT
          : Characteristic.TemperatureDisplayUnits.CELSIUS,
      );

      // Server AC state doesn't affect auto mode
      if (!userState.autoMode) {
        this.updateCharacteristicsForManualMode(acState, userState);
      }
    }

    updateUserState(
      stateDelta: Partial<UserState>,
      callback?: () => void,
    ): void {
      const newUserState: UserState = {
        ...this.userState,
        ...stateDelta,
      };

      if (userStatesEquivalent(this.userState, newUserState)) {
        if (callback) {
          callback();
        }

        return;
      }

      this.userState = newUserState;

      if (newUserState.autoMode) {
        this.updateCharacteristicsForAutoMode(newUserState);
      } else {
        this.updateCharacteristicsForManualMode(this.acState, newUserState);
      }

      // HACK: If we don't have a callback the caller probably about to call `updateAcState`
      if (callback) {
        // Make sure the AC state reflects the user state
        this.updateAcState({}, callback);
      }

      saveUserState(this.platform.config, this.deviceid, newUserState);
    }

    updateAcState(stateDelta: Partial<AcState>, callback?: () => void): void {
      const {
        autoMode,
        masterSwitch,
        heatingThresholdTemperature,
        targetTemperature: userTargetTemperature,
        coolingThresholdTemperature,
      } = this.userState;

      let newAcState: AcState = {
        ...this.acState,
        ...stateDelta,
      };

      if (masterSwitch === false) {
        newAcState.on = false;
      } else if (autoMode) {
        newAcState = calculateDesiredAcState(
          this.log.bind(this),
          {
            roomTemperature: this.temp.temperature,
            heatingThresholdTemperature,
            userTargetTemperature,
            coolingThresholdTemperature,
          },
          newAcState,
        );
      } else {
        newAcState.fanLevel = 'auto';
        if (typeof userTargetTemperature === 'number') {
          newAcState.targetTemperature = userTargetTemperature;
        }

        newAcState.on = masterSwitch;
      }

      if (acStatesEquivalent(this.acState, newAcState)) {
        if (callback) {
          callback();
        }
        return;
      }

      this.acState = newAcState;
      this.platform.sensibo.submitState(
        this.deviceid,
        newAcState,
        (data: any) => {
          if (data && data.result && data.result.status === 'Success') {
            const { acState } = data.result;

            this.acState = acState;

            this.logStateChange();
            this.applyServerState(data.result.acState);
          } else {
            this.log('Error setting state');
          }

          if (callback) {
            callback();
          }
        },
      );
    }

    logStateChange(): void {
      if (this.acState.on) {
        this.log(
          'Changed status (roomTemp: %s, mode: %s, targetTemp: %s, speed: %s)',
          this.temp.temperature,
          this.acState.mode,
          this.acState.targetTemperature,
          this.acState.fanLevel,
        );
      } else {
        this.log(
          'Changed status (roomTemp: %s, mode: off)',
          this.temp.temperature,
        );
      }
    }
  };
};
