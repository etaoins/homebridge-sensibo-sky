import { Measurement } from './measurement';
import { Logger } from '../types/logger';

type Action = 'humidify' | 'dehumidify';

const MINIMUM_HUMIDITY = 30;
const IDEAL_HUMIDITY = 40;
const MAXIMUM_HUMIDITY = 50;

interface HumidityControllerInput {
  roomMeasurement: Measurement;
  outdoorMeasurement: Measurement;
  heatingThresholdTemperature: number;
  coolingThresholdTemperature: number;
}

/**
 * Called when crossing temperature threshold to potentially improve humidity
 *
 * This is only called when the fan is already heating or cooling to avoid
 * excessive mode switches. Under the assumption the room air is already at the
 * ideal temperature this only activates if the outdoor temperature is within
 * range.
 */
export const shouldSwitchToFanMode = (
  log: Logger,
  {
    roomMeasurement,
    outdoorMeasurement,
    heatingThresholdTemperature,
    coolingThresholdTemperature,
  }: HumidityControllerInput,
): boolean => {
  let action: Action;

  if (roomMeasurement.humidity < MINIMUM_HUMIDITY) {
    action = 'humidify';
  } else if (roomMeasurement.humidity > MAXIMUM_HUMIDITY) {
    action = 'dehumidify';
  } else {
    log(`Room humidity is acceptable at ${roomMeasurement.humidity}%`);
    return false;
  }

  if (action === 'humidify') {
    if (outdoorMeasurement.humidity <= roomMeasurement.humidity) {
      log(
        `Outdoor air is more dry at ${outdoorMeasurement.humidity}%; cannot ${action}`,
      );
      return false;
    }
  } else if (outdoorMeasurement.humidity >= roomMeasurement.humidity) {
    log(
      `Outdoor air is more humid at ${outdoorMeasurement.humidity}%; cannot ${action}`,
    );
    return false;
  }

  if (outdoorMeasurement.temperature < heatingThresholdTemperature) {
    log(
      `Outdoor air too cold at ${outdoorMeasurement.temperature}C; not ${action}ing`,
    );
    return false;
  }

  if (outdoorMeasurement.temperature > coolingThresholdTemperature) {
    log(
      `Outdoor air too hot at ${outdoorMeasurement.temperature}C; not ${action}ing`,
    );
    return false;
  }

  log(`Switching to fan mode to ${action}`);
  return true;
};

/**
 * Called while within temperature range and the AC unit is fan mode
 *
 * The assumption is that we're in fan mode because `shouldSwitchToFanMode`
 * returned true; fan mode is otherwise unused by the temperature controller.
 *
 * This is more lax than `shouldSwitchToFanMode`. The fan will remain on until
 * the humidity crosses the ideal humidity. It will also allow the outdoor
 * temperature to be out-of-range if it would improve the room temperature.
 */
export const shouldStopFan = (
  log: Logger,
  {
    roomMeasurement,
    outdoorMeasurement,
    heatingThresholdTemperature,
    coolingThresholdTemperature,
  }: HumidityControllerInput,
): boolean => {
  const idealTemperature =
    (heatingThresholdTemperature + coolingThresholdTemperature) / 2;

  const action: Action =
    roomMeasurement.humidity < IDEAL_HUMIDITY ? 'humidify' : 'dehumidify';

  if (action === 'humidify') {
    if (outdoorMeasurement.humidity <= roomMeasurement.humidity) {
      log(
        `Outdoor air is too dry at ${outdoorMeasurement.humidity}%; stopping fan`,
      );
      return true;
    }
  } else if (outdoorMeasurement.humidity >= roomMeasurement.humidity) {
    log(
      `Outdoor air is too humid at ${outdoorMeasurement.humidity}%; stopping fan`,
    );
    return true;
  }

  if (
    roomMeasurement.temperature < idealTemperature &&
    outdoorMeasurement.temperature < heatingThresholdTemperature
  ) {
    log(
      `Outdoor air too cold at ${outdoorMeasurement.temperature}C; stopping fan`,
    );
    return true;
  }

  if (
    roomMeasurement.temperature > idealTemperature &&
    outdoorMeasurement.temperature > coolingThresholdTemperature
  ) {
    log(
      `Outdoor air too hot at ${outdoorMeasurement.temperature}C; stopping fan`,
    );
    return true;
  }

  return false;
};
