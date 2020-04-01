import { Logger } from '../types/logger';

import { AcState, FanLevel } from './acState';
import { Measurement } from './measurement';
import { SENSIBO_TEMPERATURE_RANGE, clampTemperature } from './temperature';

function fanLevelForTemperatureDeviation(deviation: number): FanLevel {
  if (deviation > 4.0) {
    return 'high';
  } else if (deviation > 1.0) {
    return 'medium';
  }

  return 'low';
}

interface AutoModeInput {
  roomMeasurement: Measurement;
  heatingThresholdTemperature: number;
  coolingThresholdTemperature: number;
}

export function calculateDesiredAcState(
  log: Logger,
  {
    roomMeasurement,
    heatingThresholdTemperature,
    coolingThresholdTemperature,
  }: AutoModeInput,
  prevState: AcState,
): AcState {
  log(
    'Calculating desired state (roomTemp: %s, roomHumid: %s, mode: %s, heatingThresh %s, coolingThresh: %s)',
    roomMeasurement.temperature,
    roomMeasurement.humidity,
    prevState.on ? prevState.mode : 'off',
    heatingThresholdTemperature,
    coolingThresholdTemperature,
  );

  const nextState = {
    ...prevState,
  };

  const midPointTemperature = clampTemperature(
    (heatingThresholdTemperature + coolingThresholdTemperature) / 2,
    SENSIBO_TEMPERATURE_RANGE,
  );

  if (roomMeasurement.temperature > coolingThresholdTemperature) {
    if (prevState.mode !== 'cool' || prevState.on !== true) {
      log('Hotter than cooling threshold, switching to cool mode');
    }

    nextState.mode = 'cool';
    nextState.fanLevel = fanLevelForTemperatureDeviation(
      roomMeasurement.temperature - coolingThresholdTemperature,
    );

    nextState.targetTemperature = clampTemperature(
      heatingThresholdTemperature,
      SENSIBO_TEMPERATURE_RANGE,
    );
    nextState.on = true;
  } else if (roomMeasurement.temperature < heatingThresholdTemperature) {
    if (prevState.mode !== 'heat' || prevState.on !== true) {
      log('Colder than heating threshold, switching to hot mode');
    }

    nextState.mode = 'heat';
    nextState.fanLevel = fanLevelForTemperatureDeviation(
      heatingThresholdTemperature - roomMeasurement.temperature,
    );

    nextState.targetTemperature = clampTemperature(
      coolingThresholdTemperature,
      SENSIBO_TEMPERATURE_RANGE,
    );
    nextState.on = true;
  } else if (
    (prevState.mode === 'heat' &&
      roomMeasurement.temperature > midPointTemperature) ||
    (prevState.mode === 'cool' &&
      roomMeasurement.temperature < midPointTemperature)
  ) {
    if (prevState.on === true) {
      log('Crossed temperature mid-point, switching off');
    }

    nextState.on = false;
  }

  return nextState;
}
