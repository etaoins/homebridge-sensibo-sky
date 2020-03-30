const {
  SENSIBO_TEMPERATURE_RANGE,
  clampTemperature,
} = require('../lib/temperature');

function fanLevelForTemperatureDeviation(deviation) {
  if (deviation > 4.0) {
    return 'high';
  } else if (deviation > 1.0) {
    return 'medium';
  }

  return 'low';
}

function calculateDesiredState(
  log,
  {
    roomTemperature,
    heatingThresholdTemperature,
    userTargetTemperature,
    coolingThresholdTemperature,
  },
  prevState,
) {
  log(
    'Calculating desired state (roomTemp: %s, mode: %s, heatingThresh %s, userTarget: %s, coolingThresh: %s)',
    roomTemperature,
    prevState.on ? prevState.mode : 'off',
    heatingThresholdTemperature,
    userTargetTemperature,
    coolingThresholdTemperature,
  );

  const nextState = {
    ...prevState,
  };

  const targetTemperature =
    typeof userTargetTemperature === 'number'
      ? userTargetTemperature
      : clampTemperature(
          (heatingThresholdTemperature + coolingThresholdTemperature) / 2,
          SENSIBO_TEMPERATURE_RANGE,
        );

  if (roomTemperature > coolingThresholdTemperature) {
    if (prevState.mode !== 'cool' || prevState.on !== true) {
      log('Hotter than cooling threshold, switching to cool mode');
    }

    nextState.mode = 'cool';
    nextState.fanLevel = fanLevelForTemperatureDeviation(
      roomTemperature - coolingThresholdTemperature,
    );

    nextState.targetTemperature = clampTemperature(
      heatingThresholdTemperature,
      SENSIBO_TEMPERATURE_RANGE,
    );
    nextState.on = true;
  } else if (roomTemperature < heatingThresholdTemperature) {
    if (prevState.mode !== 'heat' || prevState.on !== true) {
      log('Colder than heating threshold, switching to hot mode');
    }

    nextState.mode = 'heat';
    nextState.fanLevel = fanLevelForTemperatureDeviation(
      heatingThresholdTemperature - roomTemperature,
    );

    nextState.targetTemperature = clampTemperature(
      coolingThresholdTemperature,
      SENSIBO_TEMPERATURE_RANGE,
    );
    nextState.on = true;
  } else if (
    (prevState.mode === 'heat' && roomTemperature > targetTemperature) ||
    (prevState.mode === 'cool' && roomTemperature < targetTemperature)
  ) {
    if (prevState.on === true) {
      log('Crossed temperature threshold, switching off');
    }

    nextState.on = false;
  }

  return nextState;
}

module.exports = { calculateDesiredState };
