function statesEquivalent(left, right) {
  if (left.on === false && right.on === false) {
    // If both states are off the other values don't matter
    return true;
  }

  return (
    left.mode === right.mode &&
    left.targetTemperature === right.targetTemperature &&
    left.on === right.on &&
    left.fanLevel === right.fanLevel
  );
}

module.exports = { statesEquivalent };
