import * as Homebridge from 'homebridge';

import { AcState, FanLevel } from './acState';
import { BomObservation } from './bomObservation';
import {
  shouldStopDryMode,
  canStartDryMode,
  shouldStartFanMode,
  shouldStopFanMode,
} from './outdoorAirBenefit';
import { SensiboMeasurement } from './sensiboMeasurement';
import {
  SENSIBO_HEATING_TEMPERATURE_RANGE,
  SENSIBO_COOLING_TEMPERATURE_RANGE,
  clampTemperature,
} from './temperature';

const MIDPOINT_NORMAL_HUMIDITY = 40;
const MAXIMUM_NORMAL_HUMIDITY = 50;
const DRYING_HUMIDITY_THRESHOLD = 60;

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

const airMetricsString = ({
  temperature,
  humidity,
}: {
  temperature: number;
  humidity: number;
}): string => `${temperature}C, ${humidity}%`;

interface AutoModeInput {
  roomMeasurement: Pick<SensiboMeasurement, 'temperature' | 'humidity'>;
  heatingThresholdTemperature: number;
  coolingThresholdTemperature: number;
  bomObservation?: BomObservation;
}

interface TargetState {
  humidity: number;
  temperature: number;
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
  target: TargetState,
): boolean | null => {
  const {
    roomMeasurement,
    heatingThresholdTemperature,
    coolingThresholdTemperature,
    bomObservation,
  } = input;

  const midPointTemperature =
    (heatingThresholdTemperature + coolingThresholdTemperature) / 2;

  if (prevState.on === false) {
    return null;
  }

  switch (prevState.mode) {
    case 'auto':
      // Only the user can request auto; it has no stopping condition
      return null;

    case 'fan':
      if (
        bomObservation &&
        shouldStopFanMode({ roomMeasurement, target, bomObservation })
      ) {
        log(
          `Outdoor air (${airMetricsString(
            bomObservation,
          )}) is worse than indoor (${airMetricsString(roomMeasurement)})`,
        );

        return true;
      }

      // Fan is more of an idle state that goal seeking
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
      if (roomMeasurement.humidity < MIDPOINT_NORMAL_HUMIDITY) {
        log(
          `Dried (${roomMeasurement.humidity}) to humidity mid-point (${MIDPOINT_NORMAL_HUMIDITY})`,
        );
        return true;
      }

      if (bomObservation && shouldStopDryMode(bomObservation)) {
        log(
          `Outdoor air (${airMetricsString(
            bomObservation,
          )}) is no longer suitable for dehumidifying`,
        );

        return true;
      }

      return roomMeasurement.humidity > MAXIMUM_NORMAL_HUMIDITY
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
    bomObservation,
  } = input;

  const target = {
    temperature:
      (heatingThresholdTemperature + coolingThresholdTemperature) / 2,
    humidity: MIDPOINT_NORMAL_HUMIDITY,
  };

  log.debug(
    // eslint-disable-next-line prefer-template
    'Calculating desired state (' +
      [
        `roomTemp: ${roomMeasurement.temperature}`,
        `roomHumid: ${roomMeasurement.humidity}`,
        `outdoorTemp: ${bomObservation?.temperature ?? 'unknown'}`,
        `outdoorHumid: ${bomObservation?.humidity ?? 'unknown'}`,
        `mode: ${prevState.on ? prevState.mode : 'off'}`,
        `heatingThresh: ${heatingThresholdTemperature}`,
        `coolingThresh: ${coolingThresholdTemperature}`,
      ].join(', ') +
      ')',
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
      log(`Heating on low is ineffective; boosting to ${boostFanLevel}`);
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
      log(`Cooling on low is ineffective; boosting to ${boostFanLevel}`);
      return { ...prevState, fanLevel: boostFanLevel };
    }
  }

  const hasReachedGoal = currentModeHasReachedGoal(
    log,
    input,
    prevState,
    target,
  );

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

  if (
    roomMeasurement.humidity > DRYING_HUMIDITY_THRESHOLD &&
    (!bomObservation || canStartDryMode(bomObservation))
  ) {
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

  if (
    bomObservation &&
    shouldStartFanMode({ roomMeasurement, target, bomObservation }) &&
    prevState.mode !== 'fan'
  ) {
    log(
      `Outdoor air (${airMetricsString(
        bomObservation,
      )}) better than indoor (${airMetricsString(
        roomMeasurement,
      )}), starting fan mode`,
    );

    return {
      ...prevState,

      on: true,
      mode: 'fan',
      fanLevel: 'low',
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
