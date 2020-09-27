import * as Homebridge from 'homebridge';

import { AcMode, AcState, FanLevel } from './acState';
import { Measurement } from './measurement';
import {
  SENSIBO_HEATING_TEMPERATURE_RANGE,
  SENSIBO_COOLING_TEMPERATURE_RANGE,
  clampTemperature,
} from './temperature';

const HUMIDITY_MIDPOINT = 40;

function fanLevelForTemperatureDeviation(deviation: number): FanLevel {
  if (deviation > 7.0) {
    return 'strong';
  } else if (deviation > 4.0) {
    return 'high';
  } else if (deviation > 1.0) {
    return 'medium';
  }

  return 'low';
}

function shouldDryForTemperatureDeviation(
  humidity: number,
  deviation: number,
): boolean {
  if (deviation > 7.0) {
    return false;
  } else if (deviation > 4.0) {
    return humidity > 90;
  } else if (deviation > 1.0) {
    return humidity > 75;
  }

  return humidity > 60;
}

interface AutoModeInput {
  roomMeasurement: Pick<Measurement, 'temperature' | 'humidity'>;
  heatingThresholdTemperature: number;
  coolingThresholdTemperature: number;
}

const isCoolingMode = (mode: AcMode): boolean =>
  mode === 'cool' || mode === 'dry';

const isHeatingMode = (mode: AcMode): boolean => mode === 'heat';

export const calculateDesiredAcState = (
  log: Homebridge.Logging,
  input: AutoModeInput,
  prevState: AcState,
): AcState => {
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

  const nextState = {
    ...prevState,
  };

  const midPointTemperature =
    (heatingThresholdTemperature + coolingThresholdTemperature) / 2;

  if (roomMeasurement.temperature > coolingThresholdTemperature) {
    const deviation = roomMeasurement.temperature - coolingThresholdTemperature;

    if (shouldDryForTemperatureDeviation(roomMeasurement.humidity, deviation)) {
      // Switch to `dry` mode. This is less effective at cooling but is more dehumidifying.
      nextState.mode = 'dry';
      delete nextState.fanLevel;
    } else {
      const fanLevel = fanLevelForTemperatureDeviation(deviation);

      nextState.mode = 'cool';
      nextState.fanLevel = fanLevel;
    }

    nextState.targetTemperature = clampTemperature(
      heatingThresholdTemperature,
      SENSIBO_COOLING_TEMPERATURE_RANGE,
    );
    nextState.on = true;

    if (!isCoolingMode(prevState.mode) || prevState.on !== true) {
      log(
        `Hotter (${roomMeasurement.temperature}) than cooling threshold (${coolingThresholdTemperature}), switching to ${nextState.mode} mode`,
      );
    }
  } else if (roomMeasurement.temperature < heatingThresholdTemperature) {
    nextState.mode = 'heat';
    nextState.fanLevel = fanLevelForTemperatureDeviation(
      heatingThresholdTemperature - roomMeasurement.temperature,
    );

    nextState.targetTemperature = clampTemperature(
      coolingThresholdTemperature,
      SENSIBO_HEATING_TEMPERATURE_RANGE,
    );
    nextState.on = true;

    if (!isHeatingMode(prevState.mode) || prevState.on !== true) {
      log(
        `Colder (${roomMeasurement.temperature}) than heating threshold (${heatingThresholdTemperature}), switching to heat mode`,
      );
    }
  } else if (
    (isHeatingMode(prevState.mode) &&
      roomMeasurement.temperature > midPointTemperature) ||
    (isCoolingMode(prevState.mode) &&
      roomMeasurement.temperature < midPointTemperature)
  ) {
    if (prevState.on === true) {
      nextState.on = false;

      log(
        `Crossed (${roomMeasurement.temperature}) temperature mid-point (${midPointTemperature}), switching off`,
      );
    }
  } else if (
    prevState.mode === 'dry' &&
    roomMeasurement.humidity < HUMIDITY_MIDPOINT
  ) {
    // This is only reachable between the temperature mid-point and cooling threshold
    nextState.mode = 'cool';
    nextState.fanLevel = 'low';
    nextState.on = true;

    log(
      `Dried (${roomMeasurement.humidity}) to humidity mid-point (${HUMIDITY_MIDPOINT}), switching to cool mode`,
    );
  }

  return nextState;
};
