const SENSIBO_TEMPERATURE_RANGE = {
  // This limited to what Sensibo/AC unit understand
  minValue: 18,
  maxValue: 30,
  minStep: 1,
};

const TARGET_TEMPERATURE_RANGE = {
  // This is virtual so we can accept more values
  minValue: 16,
  maxValue: 30,
  minStep: 0.5,
};

function fahrenheitToCelsius(value) {
  return (value - 32) / 1.8;
}

function clampTemperature(value, props) {
  if (value <= props.minValue) {
    return props.minValue;
  } else if (value >= props.maxValue) {
    return props.maxValue;
  }

  return props.minStep >= 1.0 ? Math.round(value) : value;
}

module.exports = {
  SENSIBO_TEMPERATURE_RANGE,
  TARGET_TEMPERATURE_RANGE,
  fahrenheitToCelsius,
  clampTemperature,
};
