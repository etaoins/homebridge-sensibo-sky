export const SENSIBO_TEMPERATURE_RANGE = {
  // This limited to what Sensibo/AC unit understand
  minValue: 18,
  maxValue: 30,
  minStep: 1,
};

export const TARGET_TEMPERATURE_RANGE = {
  // This is virtual so we can accept more values
  minValue: 16,
  maxValue: 30,
  minStep: 0.5,
};

export function fahrenheitToCelsius(value) {
  return (value - 32) / 1.8;
}

export function celciusToFahrenheit(value) {
  return Math.round(value * 1.8 + 32);
}

export function clampTemperature(value, props) {
  if (value <= props.minValue) {
    return props.minValue;
  } else if (value >= props.maxValue) {
    return props.maxValue;
  }

  return props.minStep >= 1.0 ? Math.round(value) : value;
}
