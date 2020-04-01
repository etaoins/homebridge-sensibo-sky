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

const stateTimeout = 30_000; // in ms to min time elapse to call for refresh
const tempTimeout = 10_000; // in ms to min time elapse before next call for refresh

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
    deviceId: string;
    platform: SensiboPlatform;
    log: Logger;

    acState: AcState & { updateTime?: Date };
    roomMeasurement?: Measurement & { updateTime: Date };
    userState: UserState;

    /**
     * Timeout for debouncing user state changes
     */
    userStateApplyTimeout?: NodeJS.Timeout;

    constructor(platform: SensiboPlatform, device: Device) {
      const id = uuid.generate(`hbdev:sensibo:pod:${device.id}`);
      super(device.room.name, id);

      this.deviceGroup = 'pods';
      this.deviceId = device.id;
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

      this.userState = restoreUserState(this.platform.config, this.deviceId);

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
        `Pod ID: ${this.deviceId}`,
      );

      // Master switch
      this.addService(Service.Switch, 'Split Unit', 'Power')
        .getCharacteristic(Characteristic.On)
        .on('set', (value: any, callback: () => void) => {
          if (value && !this.userState.masterSwitch) {
            this.log('Turning master switch on');
            this.updateUserState({ masterSwitch: true });
          } else if (!value && this.userState.masterSwitch) {
            this.log('Turning master switch off');
            this.updateUserState({ masterSwitch: false });
          }

          callback();
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
              this.updateUserState({ autoMode: true });
              callback();

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

          this.updateUserState({
            targetTemperature: clampTemperature(
              value,
              SENSIBO_TEMPERATURE_RANGE,
            ),
          });

          callback();
        });

      // Heating Threshold Temperature Characteristic
      thermostatService
        .getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .setProps({ ...commonTemperatureProps, ...TARGET_TEMPERATURE_RANGE })
        .on('set', (value: any, callback: () => void) => {
          this.log(`Setting heating threshold: ${value}`);

          this.updateUserState({
            heatingThresholdTemperature: clampTemperature(
              value,
              TARGET_TEMPERATURE_RANGE,
            ),
          });

          callback();
        });

      // Cooling Threshold Temperature Characteristic
      thermostatService
        .getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .setProps({ ...commonTemperatureProps, ...TARGET_TEMPERATURE_RANGE })
        .on('set', (value: any, callback: () => void) => {
          this.log(`Setting cooling threshold: ${value}`);

          this.updateUserState({
            coolingThresholdTemperature: clampTemperature(
              value,
              TARGET_TEMPERATURE_RANGE,
            ),
          });

          callback();
        });

      // Humidity sensor service
      this.addService(Service.HumiditySensor);

      this.pollSensibo();
      setInterval(this.pollSensibo.bind(this), 30000);
    }

    pollSensibo(): void {
      this.refreshAcState((newAcState) =>
        this.refreshRoomMeasurement((newMeasurement) => {
          // Only update our state if we have new information
          if (newAcState || newMeasurement) {
            this.updateAcState({});
          }
        }),
      );
    }

    getServices(): any[] {
      return this.services;
    }

    refreshAcState(callback: (newState?: AcState) => void): void {
      // This prevents this from running more often
      const rightnow = new Date();

      if (
        this.acState.updateTime &&
        rightnow.getTime() - this.acState.updateTime.getTime() < stateTimeout
      ) {
        callback();
        return;
      }
      if (!this.acState.updateTime) {
        this.acState.updateTime = rightnow;
      }

      // Update the state
      this.platform.sensiboClient.getState(
        this.deviceId,
        (acState?: AcState) => {
          if (acState) {
            this.applyServerState(acState);
          }

          callback(acState);
        },
      );
    }

    refreshRoomMeasurement(
      callback: (newMeasurement?: Measurement) => void,
    ): void {
      // This prevents this from running more often
      if (
        this.roomMeasurement &&
        Date.now() - this.roomMeasurement.updateTime.getTime() < tempTimeout
      ) {
        callback();
        return;
      }

      // Update the temperature
      this.platform.sensiboClient.getMeasurements(
        this.deviceId,
        (data?: Measurement[]) => {
          if (data && data.length > 0) {
            const newMeasurement = {
              temperature: data[0].temperature,
              humidity: data[0].humidity,
              updateTime: new Date(),
            };

            this.getService(Service.Thermostat).updateCharacteristic(
              Characteristic.CurrentTemperature,
              newMeasurement.temperature,
            );

            this.getService(Service.HumiditySensor).updateCharacteristic(
              Characteristic.CurrentRelativeHumidity,
              Math.round(newMeasurement.humidity),
            );

            this.roomMeasurement = newMeasurement;
            callback(newMeasurement);
          } else {
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

    updateUserState(stateDelta: Partial<UserState>): void {
      const newUserState: UserState = {
        ...this.userState,
        ...stateDelta,
      };

      if (userStatesEquivalent(this.userState, newUserState)) {
        return;
      }

      this.userState = newUserState;

      if (newUserState.autoMode) {
        this.updateCharacteristicsForAutoMode(newUserState);
      } else {
        this.updateCharacteristicsForManualMode(this.acState, newUserState);
      }

      if (this.userStateApplyTimeout) {
        global.clearTimeout(this.userStateApplyTimeout);
      }

      this.userStateApplyTimeout = global.setTimeout(
        () => this.updateAcState({}),
        500,
      );

      saveUserState(this.platform.config, this.deviceId, newUserState);
    }

    updateAcState(stateDelta: Partial<AcState>, callback?: () => void): void {
      if (this.userStateApplyTimeout) {
        global.clearInterval(this.userStateApplyTimeout);
        this.userStateApplyTimeout = undefined;
      }

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
        if (this.roomMeasurement) {
          newAcState = calculateDesiredAcState(
            this.log.bind(this),
            {
              roomMeasurement: this.roomMeasurement,
              heatingThresholdTemperature,
              coolingThresholdTemperature,
            },
            newAcState,
          );
        }
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
      this.platform.sensiboClient.submitState(
        this.deviceId,
        newAcState,
        (data: any) => {
          if (data?.result.status === 'Success') {
            const { acState } = data.result;

            this.logStateChange(acState);
            this.applyServerState(acState);
          } else {
            this.log('Error setting state');
          }

          if (callback) {
            callback();
          }
        },
      );
    }

    logStateChange(acState: AcState): void {
      if (acState.on) {
        this.log(
          'Changed status (roomTemp: %s, mode: %s, targetTemp: %s, speed: %s)',
          this.indoorMeasurement?.temperature ?? 'unknown',
          acState.mode,
          acState.targetTemperature,
          acState.fanLevel,
        );
      } else {
        this.log(
          'Changed status (roomTemp: %s, mode: off)',
          this.indoorMeasurement?.temperature ?? 'unknown',
        );
      }
    }
  };
};
