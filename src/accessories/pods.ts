import * as Homebridge from 'homebridge';

import { calculateDesiredAcState } from '../lib/autoController';
import { acStatesEquivalent, AcState } from '../lib/acState';
import { Device } from '../lib/device';
import { BomObservation, pollNextObservationInMs } from '../lib/bomObservation';
import {
  SensiboMeasurement,
  pollNextMeasurementInMs,
} from '../lib/sensiboMeasurement';
import { getBomObservation } from '../lib/bomClient';
import {
  saveUserState,
  restoreUserState,
  userStatesEquivalent,
  UserState,
} from '../lib/userState';
import {
  SENSIBO_AUTO_TEMPERATURE_RANGE,
  TARGET_TEMPERATURE_RANGE,
  clampTemperature,
  fahrenheitToCelsius,
} from '../lib/temperature';
import type { SensiboPlatform } from '../index';

const heatingCoolingStateForAcState = (
  acState: AcState,
  characteristic:
    | Homebridge.HAP['Characteristic']['TargetHeatingCoolingState']
    | Homebridge.HAP['Characteristic']['CurrentHeatingCoolingState'],
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

// Pod Accessory
export class SensiboPodAccessory implements Homebridge.AccessoryPlugin {
  static deviceGroup = 'pods';
  public deviceId: string;
  public name: string;

  private log: Homebridge.Logging;

  private acState: AcState;
  private roomMeasurement?: SensiboMeasurement;
  private bomObservation?: BomObservation;
  private userState: UserState;

  private readonly informationService: Homebridge.Service;
  private readonly thermostatService: Homebridge.Service;
  private readonly yieldSwitchService: Homebridge.Service;

  /**
   * Timeout for debouncing user state changes
   */
  userStateApplyTimeout?: NodeJS.Timer;

  constructor(
    private hap: Homebridge.HAP,
    private platform: SensiboPlatform,
    device: Device,
  ) {
    this.deviceId = device.id;
    this.name = device.room.name;
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

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(
        hap.Characteristic.Manufacturer,
        'homebridge-sensibo-sky',
      )
      .setCharacteristic(hap.Characteristic.Model, 'version 0.2.1')
      .setCharacteristic(
        hap.Characteristic.SerialNumber,
        `Pod ID: ${this.deviceId}`,
      );

    // Thermostat Service
    this.thermostatService = new hap.Service.Thermostat();

    // Current Temperature characteristic
    this.thermostatService
      .getCharacteristic(hap.Characteristic.CurrentTemperature)
      .setProps({
        unit: hap.Characteristic.Units.CELSIUS,
        minStep: 0.1,
        perms: [hap.Characteristic.Perms.READ, hap.Characteristic.Perms.NOTIFY],
      });

    // Target Heating/Cooling Mode characteristic
    this.thermostatService
      .getCharacteristic(hap.Characteristic.TargetHeatingCoolingState)
      .on(
        Homebridge.CharacteristicEventTypes.SET,
        (
          value: Homebridge.CharacteristicValue,
          callback: Homebridge.CharacteristicSetCallback,
        ) => {
          switch (value) {
            case hap.Characteristic.TargetHeatingCoolingState.COOL:
              this.log('Setting target heating mode to cool');

              this.updateUserState({ autoMode: false });
              this.updateAcState({ on: true, mode: 'cool' })
                .then(() => callback())
                .catch(callback);

              break;
            case hap.Characteristic.TargetHeatingCoolingState.HEAT:
              this.log('Setting target heating mode to heat');

              this.updateUserState({ autoMode: false });
              this.updateAcState({ on: true, mode: 'heat' })
                .then(() => callback())
                .catch(callback);

              break;
            case hap.Characteristic.TargetHeatingCoolingState.AUTO:
              this.log('Setting target heating mode to auto');
              this.updateUserState({ autoMode: true });
              callback(undefined);

              break;

            case hap.Characteristic.TargetHeatingCoolingState.OFF:
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
      format: hap.Formats.FLOAT,
      unit: hap.Units.CELSIUS,
      perms: [hap.Perms.PAIRED_READ, hap.Perms.PAIRED_WRITE, hap.Perms.NOTIFY],
    };

    // Target Temperature characteristic
    this.thermostatService
      .getCharacteristic(hap.Characteristic.TargetTemperature)
      .setProps({
        ...commonTemperatureProps,
        ...SENSIBO_AUTO_TEMPERATURE_RANGE,
      })
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
                SENSIBO_AUTO_TEMPERATURE_RANGE,
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
    this.thermostatService
      .getCharacteristic(hap.Characteristic.HeatingThresholdTemperature)
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
    this.thermostatService
      .getCharacteristic(hap.Characteristic.CoolingThresholdTemperature)
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

    this.yieldSwitchService = new hap.Service.Switch('Yield AC');

    // We don't need to wait for the AC state to do this
    if (this.userState.autoMode) {
      this.updateCharacteristicsForAutoMode(this.userState);
    }

    this.pollSensibo().catch((err) => this.log.warn(err));

    const { bomObservationsUrl } = this.platform.config;
    if (bomObservationsUrl) {
      this.pollBom(bomObservationsUrl).catch((err) => this.log.warn(err));
    }
  }

  getServices(): Homebridge.Service[] {
    return [
      this.informationService,
      this.thermostatService,
      this.yieldSwitchService,
    ];
  }

  identify(): void {
    this.log('Identify! (name: %s)', this.name);
  }

  private async pollSensibo(): Promise<void> {
    let newMeasurement: SensiboMeasurement | undefined;

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
    }, pollNextMeasurementInMs(this.log, newMeasurement));

    const newAcState = await this.refreshAcState();

    // Only update our state if we have new information
    if (newAcState || newMeasurement) {
      await this.updateAcState({});
    }
  }

  private async pollBom(bomObservationsUrl: string): Promise<void> {
    try {
      this.bomObservation = await getBomObservation(bomObservationsUrl);
    } catch (err) {
      // If the BOM goes down then clear the stale observation
      delete this.bomObservation;

      this.log.warn(err);
    }

    global.setTimeout(() => {
      this.pollBom(bomObservationsUrl).catch((err) => {
        if (err instanceof Error) {
          this.log.warn(err.message);
        } else {
          this.log.warn('Caught non-error', err);
        }
      });
    }, pollNextObservationInMs());
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

    this.thermostatService.updateCharacteristic(
      this.hap.Characteristic.CurrentTemperature,
      newMeasurement.temperature,
    );

    this.thermostatService.updateCharacteristic(
      this.hap.Characteristic.CurrentRelativeHumidity,
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
      this.thermostatService
        .updateCharacteristic(
          this.hap.Characteristic.TargetHeatingCoolingState,
          this.hap.Characteristic.TargetHeatingCoolingState.AUTO,
        )
        .updateCharacteristic(
          this.hap.Characteristic.TargetTemperature,
          userState.targetTemperature,
        );
    }
  }

  private updateCharacteristicsForManualMode(acState: AcState): void {
    this.thermostatService
      .updateCharacteristic(
        this.hap.Characteristic.TargetHeatingCoolingState,
        heatingCoolingStateForAcState(
          acState,
          this.hap.Characteristic.TargetHeatingCoolingState,
        ),
      )
      .updateCharacteristic(
        this.hap.Characteristic.TargetTemperature,
        acState.targetTemperature,
      );
  }

  private updateCharacteristicsFromAcState(
    acState: AcState,
    userState: UserState,
  ): void {
    // Current heating/cooling state
    this.thermostatService.updateCharacteristic(
      this.hap.Characteristic.CurrentHeatingCoolingState,
      heatingCoolingStateForAcState(
        acState,
        this.hap.Characteristic.CurrentHeatingCoolingState,
      ),
    );

    // Temperature Display Units characteristic
    this.thermostatService.updateCharacteristic(
      this.hap.Characteristic.TemperatureDisplayUnits,
      acState.temperatureUnit === 'F'
        ? this.hap.Characteristic.TemperatureDisplayUnits.FAHRENHEIT
        : this.hap.Characteristic.TemperatureDisplayUnits.CELSIUS,
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
        const desiredAcState = calculateDesiredAcState(
          this.log,
          {
            roomMeasurement: this.roomMeasurement,
            heatingThresholdTemperature,
            coolingThresholdTemperature,
            bomObservation: this.bomObservation,
            yieldAc: Boolean(
              this.yieldSwitchService.getCharacteristic(
                this.hap.Characteristic.On,
              ).value,
            ),
          },
          newAcState,
        );

        if (desiredAcState === false) {
          // Nothing to do
          return;
        }

        newAcState = desiredAcState;
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
    const roomHumid = this.roomMeasurement?.humidity ?? 'unknown';

    const { mode, targetTemperature } = acState;
    const fanLevel = acState.fanLevel ?? 'N/A';

    if (!acState.on) {
      this.log(`Changed AC state (roomTemp: ${roomTemp}, mode: off)`);
    } else if (mode === 'dry') {
      this.log(
        `Changed AC state (roomTemp: ${roomTemp}, mode: ${mode}, roomHumid: ${roomHumid})`,
      );
    } else {
      this.log(
        `Changed AC state (roomTemp: ${roomTemp}, mode: ${mode}, targetTemp: ${targetTemperature}, speed: ${fanLevel})`,
      );
    }
  }
}
