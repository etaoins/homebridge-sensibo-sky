export type AcMode = 'cool' | 'heat' | 'fan' | 'auto' | 'dry';
export type FanLevel =
  | 'auto'
  | 'low'
  | 'medium_low'
  | 'medium'
  | 'medium_high'
  | 'high'
  | 'strong';

export interface AcState {
  on: boolean;
  targetTemperature: number;
  mode: AcMode;
  fanLevel?: FanLevel;
  temperatureUnit: 'F' | 'C';
}

export const acStatesEquivalent = (left: AcState, right: AcState): boolean => {
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
};
