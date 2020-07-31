import * as Homebridge from 'homebridge';

import { calculateDesiredAcState } from '../lib/temperatureController';
import { acStatesEquivalent, AcState } from '../lib/acState';
import { Device } from '../lib/device';
import { Measurement, pollNextMeasurementInMs } from '../lib/measurement';
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

// Pod Accessory
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export default (hap: Homebridge.HAP) => {
  const { Service, Characteristic, Accessory, uuid } = hap;

  const heatingCoolingStateForAcState = (
    acState: AcState,
    characteristic:
      | typeof Characteristic.TargetHeatingCoolingState
      | typeof Characteristic.CurrentHeatingCoolingState,
  ) => {
    if (acState.on === false) {
      return characteristic.OFF;
    }

    switch (acState.mode) {
      case 'cool':
        return characteristic.COOL;
      case 'heat':
        return characteristic.HEAT;
      default:
        return characteristic.OFF;
    }
  };

  return class SensiboPodAccessory extends Accessory {
    static deviceGroup = 'pods';
    public deviceId: string;

    private platform: SensiboPlatform;
    private log: Homebridge.Logging;

    private acState: AcState;
    private roomMeasurement?: Measurement;
    private userState: UserState;

    /**
     * Timeout for debouncing user state changes
     */
    userStateApplyTimeout?: NodeJS.Timer;

    constructor(platform: SensiboPlatform, device: Device) {
      const id = uuid.generate(`sensibo-sky:pod:${device.id}`);
      super(device.room.name, id);

      this.deviceId = device.id;
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
      this.getService(Service.AccessoryInformation)!.setCharacteristic(
        Characteristic.Manufacturer,
        'homebridge-sensibo-sky',
      );

      // Model characteristic
      this.getService(Service.AccessoryInformation)!.setCharacteristic(
        Characteristic.Model,
        'version 0.2.1',
      );

      // SerialNumber characteristic
      this.getService(Service.AccessoryInformation)!.setCharacteristic(
        Characteristic.SerialNumber,
        `Pod ID: ${this.deviceId}`,
      );

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
        .on(
          Homebridge.CharacteristicEventTypes.SET,
          (
            value: Homebridge.CharacteristicValue,
            callback: Homebridge.CharacteristicSetCallback,
          ) => {
            switch (value) {
              case Characteristic.TargetHeatingCoolingState.COOL:
                this.log('Setting target heating mode to cool');

                this.updateUserState({ autoMode: false });
                this.updateAcState({ on: true, mode: 'cool' })
                  .then(() => callback())
                  .catch(callback);

                break;
              case Characteristic.TargetHeatingCoolingState.HEAT:
                this.log('Setting target heating mode to heat');

                this.updateUserState({ autoMode: false });
                this.updateAcState({ on: true, mode: 'heat' })
                  .then(() => callback())
                  .catch(callback);

                break;
              case Characteristic.TargetHeatingCoolingState.AUTO:
                this.log('Setting target heating mode to auto');
                this.updateUserState({ autoMode: true });
                callback(undefined);

                break;

              case Characteristic.TargetHeatingCoolingState.OFF:
              default:
                this.log('Setting target heating mode to off');

                this.updateUserState({ autoMode: false });
                this.updateAcState({ on: false })
                  .then(() => callback())
                  .catch(callback);

                break;
            }
          },
        );

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
        .on(
          Homebridge.CharacteristicEventTypes.SET,
          (
            value: Homebridge.CharacteristicValue,
            callback: Homebridge.CharacteristicSetCallback,
          ) => {
            this.log(`Setting target temperature: ${value.toString()}`);

            if (typeof value === 'number') {
              this.updateUserState({
                targetTemperature: clampTemperature(
                  value,
                  SENSIBO_TEMPERATURE_RANGE,
                ),
              });
            } else {
              this.log.warn(
                `Target temperature had unexpected type of ${typeof value}`,
              );
            }

            callback();
          },
        );

      // Heating Threshold Temperature Characteristic
      thermostatService
        .getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .setProps({ ...commonTemperatureProps, ...TARGET_TEMPERATURE_RANGE })
        .setValue(this.userState.heatingThresholdTemperature)
        .on(
          Homebridge.CharacteristicEventTypes.SET,
          (
            value: Homebridge.CharacteristicValue,
            callback: Homebridge.CharacteristicSetCallback,
          ) => {
            this.log(`Setting heating threshold: ${value.toString()}`);

            if (typeof value === 'number') {
              this.updateUserState({
                heatingThresholdTemperature: clampTemperature(
                  value,
                  TARGET_TEMPERATURE_RANGE,
                ),
              });
            } else {
              this.log.warn(
                `Heating threshold had unexpected type of ${typeof value}`,
              );
            }

            callback();
          },
        );

      // Cooling Threshold Temperature Characteristic
      thermostatService
        .getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .setProps({ ...commonTemperatureProps, ...TARGET_TEMPERATURE_RANGE })
        .setValue(this.userState.coolingThresholdTemperature)
        .on(
          Homebridge.CharacteristicEventTypes.SET,
          (
            value: Homebridge.CharacteristicValue,
            callback: Homebridge.CharacteristicSetCallback,
          ) => {
            this.log(`Setting cooling threshold: ${value.toString()}`);

            if (typeof value === 'number') {
              this.updateUserState({
                coolingThresholdTemperature: clampTemperature(
                  value,
                  TARGET_TEMPERATURE_RANGE,
                ),
              });
            } else {
              this.log.warn(
                `Cooling threshold had unexpected type of ${typeof value}`,
              );
            }

            callback();
          },
        );

      // We don't need to wait for the AC state to do this
      if (this.userState.autoMode) {
        this.updateCharacteristicsForAutoMode(this.userState);
      }

      this.pollSensibo().catch((err) => this.log.warn(err));
    }

    getServices(): Homebridge.Service[] {
      return this.services;
    }

    identify(): void {
      this.log('Identify! (name: %s)', this.displayName);
    }

    private async pollSensibo(): Promise<void> {
      let newMeasurement: Measurement | undefined;

      try {
        newMeasurement = await this.refreshRoomMeasurement();
      } catch (err) {
        this.log.warn(err);
      }

      global.setTimeout(() => {
        this.pollSensibo().catch((err) => {
          if (err instanceof Error) {
            this.log.warn(err.message);
          } else {
            this.log.warn('Caught non-error', err);
          }
        });
      }, pollNextMeasurementInMs(this.log.bind(this.log), newMeasurement));

      const newAcState = await this.refreshAcState();

      // Only update our state if we have new information
      if (newAcState || newMeasurement) {
        await this.updateAcState({});
      }
    }

    private async refreshAcState(): Promise<AcState | undefined> {
      // Fetch the server state
      const serverAcState = await this.platform.sensiboClient.getAcState(
        this.deviceId,
      );

      if (serverAcState) {
        this.applyServerState(serverAcState);
      }

      return serverAcState;
    }

    private async refreshRoomMeasurement(): Promise<Measurement | undefined> {
      // Update the temperature
      const measurements = await this.platform.sensiboClient.getMeasurements(
        this.deviceId,
      );

      if (measurements.length === 0) {
        return;
      }

      const [newMeasurement] = measurements;

      this.getService(Service.Thermostat)!.updateCharacteristic(
        Characteristic.CurrentTemperature,
        newMeasurement.temperature,
      );

      this.getService(Service.Thermostat)!.updateCharacteristic(
        Characteristic.CurrentRelativeHumidity,
        Math.round(newMeasurement.humidity),
      );

      this.roomMeasurement = newMeasurement;
      return newMeasurement;
    }

    private applyServerState(acState: AcState): void {
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

      if (!this.userState.autoMode) {
        this.userState.targetTemperature = this.acState.targetTemperature;
      }

      this.updateCharacteristicsFromAcState(acState, this.userState);
    }

    private updateCharacteristicsForAutoMode(userState: UserState): void {
      if (typeof userState.targetTemperature !== 'undefined') {
        this.getService(Service.Thermostat)!
          .updateCharacteristic(
            Characteristic.TargetHeatingCoolingState,
            Characteristic.TargetHeatingCoolingState.AUTO,
          )
          .updateCharacteristic(
            Characteristic.TargetTemperature,
            userState.targetTemperature,
          );
      }
    }

    private updateCharacteristicsForManualMode(acState: AcState): void {
      this.getService(Service.Thermostat)!
        .updateCharacteristic(
          Characteristic.TargetHeatingCoolingState,
          heatingCoolingStateForAcState(
            acState,
            Characteristic.TargetHeatingCoolingState,
          ),
        )
        .updateCharacteristic(
          Characteristic.TargetTemperature,
          acState.targetTemperature,
        );
    }

    private updateCharacteristicsFromAcState(
      acState: AcState,
      userState: UserState,
    ): void {
      const thermostatService = this.getService(Service.Thermostat)!;

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
        this.updateCharacteristicsForManualMode(acState);
      }
    }

    private updateUserState(stateDelta: Partial<UserState>): void {
      const newUserState: UserState = {
        ...this.userState,
        ...stateDelta,
      };

      if (userStatesEquivalent(this.userState, newUserState)) {
        return;
      }

      this.userState = newUserState;

      // User state doesn't affect manual mode
      if (newUserState.autoMode) {
        this.updateCharacteristicsForAutoMode(newUserState);
      }

      if (this.userStateApplyTimeout) {
        global.clearTimeout(this.userStateApplyTimeout);
      }

      this.userStateApplyTimeout = global.setTimeout(() => {
        saveUserState(
          this.platform.config,
          this.deviceId,
          newUserState,
        ).catch((err) => this.log.warn(`Error saving state: ${String(err)}`));

        this.updateAcState({}).catch((err) => {
          if (err instanceof Error) {
            this.log.warn(err.message);
          } else {
            this.log.warn('Caught non-error', err);
          }
        });
      }, 500);
    }

    private async updateAcState(stateDelta: Partial<AcState>): Promise<void> {
      if (this.userStateApplyTimeout) {
        global.clearInterval(this.userStateApplyTimeout);
        this.userStateApplyTimeout = undefined;
      }

      const {
        autoMode,
        heatingThresholdTemperature,
        targetTemperature: userTargetTemperature,
        coolingThresholdTemperature,
      } = this.userState;

      let newAcState: AcState = {
        ...this.acState,
        ...stateDelta,
      };

      if (autoMode) {
        if (this.roomMeasurement) {
          newAcState = calculateDesiredAcState(
            this.log.bind(this.log),
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
      }

      if (acStatesEquivalent(this.acState, newAcState)) {
        return;
      }

      this.acState = newAcState;
      const serverAcState = await this.platform.sensiboClient.submitState(
        this.deviceId,
        newAcState,
      );

      this.logStateChange(serverAcState);
      this.applyServerState(serverAcState);
    }

    private logStateChange(acState: AcState): void {
      const roomTemp = this.roomMeasurement?.temperature ?? 'unknown';

      if (acState.on) {
        this.log(
          'Changed AC state (roomTemp: %s, mode: %s, targetTemp: %s, speed: %s)',
          roomTemp,
          acState.mode,
          acState.targetTemperature,
          acState.fanLevel,
        );
      } else {
        this.log('Changed AC state (roomTemp: %s, mode: off)', roomTemp);
      }
    }
  };
};
