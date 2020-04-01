export interface TemperatureRange {
  minValue: number;
  maxValue: number;
  minStep: number;
}

export const SENSIBO_TEMPERATURE_RANGE: TemperatureRange = {
  // This limited to what Sensibo/AC unit understand
  minValue: 18,
  maxValue: 30,
  minStep: 1,
};

export const TARGET_TEMPERATURE_RANGE: TemperatureRange = {
  // This is virtual so we can accept more values
  minValue: 16,
  maxValue: 30,
  minStep: 0.5,
};

export function fahrenheitToCelsius(value: number): number {
  return (value - 32) / 1.8;
}

export function celciusToFahrenheit(value: number): number {
  return Math.round(value * 1.8 + 32);
}

export function clampTemperature(
  value: number,
  range: TemperatureRange,
): number {
  if (value <= range.minValue) {
    return range.minValue;
  } else if (value >= range.maxValue) {
    return range.maxValue;
  }

  return range.minStep >= 1.0 ? Math.round(value) : value;
}
