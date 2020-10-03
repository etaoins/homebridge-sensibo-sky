import * as Homebridge from 'homebridge';

import { AcState, FanLevel } from './acState';
import { Measurement } from './measurement';
import {
  SENSIBO_HEATING_TEMPERATURE_RANGE,
  SENSIBO_COOLING_TEMPERATURE_RANGE,
  clampTemperature,
} from './temperature';

const DRYING_HUMIDITY_THRESHOLD = 50;

const fanLevelForTemperatureDeviation = (deviation: number): FanLevel => {
  if (deviation > 7.0) {
    return 'strong';
  } else if (deviation > 4.0) {
    return 'high';
  } else if (deviation > 1.0) {
    return 'medium';
  }

  return 'low';
};

interface AutoModeInput {
  roomMeasurement: Pick<Measurement, 'temperature' | 'humidity'>;
  heatingThresholdTemperature: number;
  coolingThresholdTemperature: number;
}

/**
 * Determines if the current state of the unit has reached or passed its goal
 *
 * This returns a tristate:
 *
 * - `true` means the AC is in a goal-directed state and has reached its goal
 * - `false` means the AC is in a goal-directed state and has more work to do
 * - `null` means the AC was not in a goal-directed state (off, fan or auto)
 */
const currentModeHasReachedGoal = (
  log: Homebridge.Logging,
  input: AutoModeInput,
  prevState: AcState,
): boolean | null => {
  const MIDPOINT_HUMIDITY = 40;

  const {
    roomMeasurement,
    heatingThresholdTemperature,
    coolingThresholdTemperature,
  } = input;

  const midPointTemperature =
    (heatingThresholdTemperature + coolingThresholdTemperature) / 2;

  if (prevState.on === false) {
    return null;
  }

  switch (prevState.mode) {
    case 'fan':
    case 'auto':
      // Only the user can request these; they have no stopping condition
      return null;

    case 'heat':
      if (roomMeasurement.temperature > midPointTemperature) {
        log(
          `Heated (${roomMeasurement.temperature}) to temperature mid-point (${midPointTemperature})`,
        );
        return true;
      }

      return false;

    case 'cool':
      if (roomMeasurement.temperature < midPointTemperature) {
        log(
          `Cooled (${roomMeasurement.temperature}) to temperature mid-point (${midPointTemperature})`,
        );
        return true;
      }

      return false;

    case 'dry':
      if (roomMeasurement.humidity < MIDPOINT_HUMIDITY) {
        log(
          `Dried (${roomMeasurement.humidity}) to humidity mid-point (${MIDPOINT_HUMIDITY})`,
        );
        return true;
      }

      return roomMeasurement.humidity > DRYING_HUMIDITY_THRESHOLD
        ? false
        : // Returning `null` here yields to the temperature thresholds
          null;
  }
};

export const calculateDesiredAcState = (
  log: Homebridge.Logging,
  input: AutoModeInput,
  prevState: AcState,
): AcState | false => {
  const {
    roomMeasurement,
    heatingThresholdTemperature,
    coolingThresholdTemperature,
  } = input;

  log.debug(
    'Calculating desired state (roomTemp: %s, mode: %s, heatingThresh %s, coolingThresh: %s)',
    roomMeasurement.temperature,
    prevState.on ? prevState.mode : 'off',
    heatingThresholdTemperature,
    coolingThresholdTemperature,
  );

  // See if we need to fan boost
  if (
    prevState.on &&
    prevState.mode === 'heat' &&
    prevState.fanLevel === 'low'
  ) {
    const boostFanLevel = fanLevelForTemperatureDeviation(
      heatingThresholdTemperature - roomMeasurement.temperature,
    );

    if (boostFanLevel !== 'low') {
      return { ...prevState, fanLevel: boostFanLevel };
    }
  }

  if (
    prevState.on &&
    prevState.mode === 'cool' &&
    prevState.fanLevel === 'low'
  ) {
    const boostFanLevel = fanLevelForTemperatureDeviation(
      roomMeasurement.temperature - coolingThresholdTemperature,
    );

    if (boostFanLevel !== 'low') {
      return { ...prevState, fanLevel: boostFanLevel };
    }
  }

  const hasReachedGoal = currentModeHasReachedGoal(log, input, prevState);
  if (hasReachedGoal === false) {
    // Still trying to reach goal
    return false;
  }

  if (roomMeasurement.temperature > coolingThresholdTemperature) {
    log(
      `Hotter (${roomMeasurement.temperature}) than cooling threshold (${coolingThresholdTemperature}), starting cool mode`,
    );

    return {
      ...prevState,

      on: true,
      mode: 'cool',
      fanLevel: fanLevelForTemperatureDeviation(
        roomMeasurement.temperature - coolingThresholdTemperature,
      ),
      targetTemperature: clampTemperature(
        heatingThresholdTemperature,
        SENSIBO_COOLING_TEMPERATURE_RANGE,
      ),
    };
  }

  if (roomMeasurement.temperature < heatingThresholdTemperature) {
    log(
      `Colder (${roomMeasurement.temperature}) than heating threshold (${heatingThresholdTemperature}), starting heat mode`,
    );

    return {
      ...prevState,

      on: true,
      mode: 'heat',
      fanLevel: fanLevelForTemperatureDeviation(
        heatingThresholdTemperature - roomMeasurement.temperature,
      ),
      targetTemperature: clampTemperature(
        coolingThresholdTemperature,
        SENSIBO_HEATING_TEMPERATURE_RANGE,
      ),
    };
  }

  if (roomMeasurement.humidity > DRYING_HUMIDITY_THRESHOLD) {
    log(
      `More humid (${roomMeasurement.humidity}) than drying threshold (${DRYING_HUMIDITY_THRESHOLD}), starting dry mode`,
    );

    return {
      ...prevState,

      on: true,
      mode: 'dry',
      fanLevel: undefined,
    };
  }

  if (hasReachedGoal === true) {
    log('Reached goal with nothing else to do; switching off');

    return {
      ...prevState,

      on: false,
    };
  }

  // Nothing to do
  return false;
};
