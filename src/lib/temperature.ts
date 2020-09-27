export interface TemperatureRange {
  minValue: number;
  maxValue: number;
  minStep: number;
}

export const SENSIBO_HEATING_TEMPERATURE_RANGE: TemperatureRange = {
  minValue: 10,
  maxValue: 30,
  minStep: 1,
};

export const SENSIBO_COOLING_TEMPERATURE_RANGE: TemperatureRange = {
  minValue: 18,
  maxValue: 30,
  minStep: 1,
};

export const SENSIBO_AUTO_TEMPERATURE_RANGE = SENSIBO_COOLING_TEMPERATURE_RANGE;

export const TARGET_TEMPERATURE_RANGE: TemperatureRange = {
  // This is virtual so we can accept more values
  minValue: 10,
  maxValue: 30,
  minStep: 0.5,
};

export const fahrenheitToCelsius = (value: number): number =>
  (value - 32) / 1.8;

export const celciusToFahrenheit = (value: number): number =>
  Math.round(value * 1.8 + 32);

export const clampTemperature = (
  value: number,
  range: TemperatureRange,
): number => {
  if (value <= range.minValue) {
    return range.minValue;
  } else if (value >= range.maxValue) {
    return range.maxValue;
  }

  return range.minStep >= 1.0 ? Math.round(value) : value;
};
