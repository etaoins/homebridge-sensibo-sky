import { calculateDesiredAcState } from '../lib/temperatureController';
import { acStatesEquivalent, AcState } from '../lib/acState';
import {
  intervalUntilNextObservation,
  getOutdoorMeasurement,
} from '../lib/bomClient';
import { Device } from '../lib/device';
import { Logger } from '../types/logger';
import { Measurement } from '../lib/measurement';
import {
  MEASUREMENT_INTERVAL_SECS,
  SensiboMeasurement,
} from '../lib/sensiboClient';
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
    static deviceGroup = 'pods';
    public deviceId: string;

    private platform: SensiboPlatform;
    private log: Logger;

    private acState: AcState;
    private roomMeasurement?: Measurement;
    private outdoorMeasurement?: Measurement;
    private userState: UserState;

    /**
     * Timeout for debouncing user state changes
     */
    userStateApplyTimeout?: NodeJS.Timer;

    constructor(platform: SensiboPlatform, device: Device) {
      const id = uuid.generate(`sensibo-sky:pod:${device.id}`);
      super(device.room.name, id);

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
        .on('set', (value: any, callback: (err: any) => void) => {
          switch (value) {
            case Characteristic.TargetHeatingCoolingState.COOL:
              this.log('Setting target heating mode to cool');

              this.updateUserState({ autoMode: false });
              this.updateAcState({ on: true, mode: 'cool' })
                .then(callback)
                .catch(callback);

              break;
            case Characteristic.TargetHeatingCoolingState.HEAT:
              this.log('Setting target heating mode to heat');

              this.updateUserState({ autoMode: false });
              this.updateAcState({ on: true, mode: 'heat' })
                .then(callback)
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
              this.updateAcState({ mode: 'fan' })
                .then(callback)
                .catch(callback);

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
        .setValue(this.userState.heatingThresholdTemperature)
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
        .setValue(this.userState.coolingThresholdTemperature)
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

      // Blower Fan
      this.addService(Service.Fan, 'Blower Fan', 'BlowerFan')
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

      // Humidity sensor service
      this.addService(Service.HumiditySensor);

      // We don't need to wait for the AC state to do this
      if (this.userState.autoMode) {
        this.updateCharacteristicsForAutoMode(this.userState);
      }

      this.pollSensibo().catch((err) => this.log.warn(err));

      const { bomObservationsUrl } = this.platform.config;
      if (bomObservationsUrl) {
        const refreshOutdoorMeasurement = async (): Promise<void> => {
          const resetTimer = () => {
            global.setTimeout(() => {
              refreshOutdoorMeasurement();
              return;
            }, intervalUntilNextObservation());
          };

          try {
            const measurement = await getOutdoorMeasurement(bomObservationsUrl);

            this.outdoorMeasurement = measurement;
            this.log(
              `Retrieved BOM observation (outdoorTemp: ${measurement.temperature}, outdoorHumid: ${measurement.humidity})`,
            );
          } catch (err) {
            this.log.warn(err);
            resetTimer();
          }
        };

        refreshOutdoorMeasurement();
      }
    }

    getServices(): any[] {
      return this.services;
    }

    identify(): void {
      this.log('Identify! (name: %s)', this.name);
    }

    private async pollSensibo(): Promise<void> {
      const newAcState = await this.refreshAcState();
      const newMeasurement = await this.refreshRoomMeasurement();

      // Only update our state if we have new information
      if (newAcState || newMeasurement) {
        await this.updateAcState({});
      }

      const nextRefresh =
        (MEASUREMENT_INTERVAL_SECS -
          (newMeasurement?.time.secondsAgo ?? 0) +
          1) *
        1000;

      global.setTimeout(() => {
        this.pollSensibo().catch((err) => {
          this.log.warn(err.message);
        });
      }, nextRefresh);
    }

    private async refreshAcState(): Promise<AcState | undefined> {
      // Fetch the server state
      const serverAcState = await this.platform.sensiboClient.getState(
        this.deviceId,
      );

      if (serverAcState) {
        this.applyServerState(serverAcState);
      }

      return serverAcState;
    }

    private async refreshRoomMeasurement(): Promise<
      SensiboMeasurement | undefined
    > {
      // Update the temperature
      const measurements = await this.platform.sensiboClient.getMeasurements(
        this.deviceId,
      );

      if (measurements.length === 0) {
        return;
      }

      const [newMeasurement] = measurements;

      this.getService(Service.Thermostat).updateCharacteristic(
        Characteristic.CurrentTemperature,
        newMeasurement.temperature,
      );

      this.getService(Service.HumiditySensor).updateCharacteristic(
        Characteristic.CurrentRelativeHumidity,
        Math.round(newMeasurement.humidity),
      );

      this.roomMeasurement = {
        temperature: newMeasurement.temperature,
        humidity: newMeasurement.humidity,
      };

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
      this.getService(Service.Fan).updateCharacteristic(
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

    private updateCharacteristicsForManualMode(
      acState: AcState,
      userState: UserState,
    ): void {
      this.getService(Service.Fan).updateCharacteristic(
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

    private updateCharacteristicsFromAcState(
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

    private updateUserState(stateDelta: Partial<UserState>): void {
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

      this.userStateApplyTimeout = global.setTimeout(() => {
        this.updateAcState({});
      }, 500);

      saveUserState(
        this.platform.config,
        this.deviceId,
        newUserState,
      ).catch((err) => this.log.warn(`Error saving state: ${err}`));
    }

    private async updateAcState(stateDelta: Partial<AcState>): Promise<void> {
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
              outdoorMeasurement: this.outdoorMeasurement,
              heatingThresholdTemperature,
              coolingThresholdTemperature,
            },
            newAcState,
          );
        }
      } else {
        newAcState.on = true;
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
