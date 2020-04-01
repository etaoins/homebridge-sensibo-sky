export interface AcState {
  on: boolean;
  targetTemperature: number;
  mode: 'heat' | 'cool';
  fanLevel: 'auto' | 'low' | 'medium' | 'high';
  temperatureUnit: 'F' | 'C';
}

export function acStatesEquivalent(left: AcState, right: AcState): boolean {
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
