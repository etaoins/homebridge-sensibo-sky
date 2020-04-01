export interface UserState {
  masterSwitch: boolean;
  autoMode: boolean;
  heatingThresholdTemperature?: number;
  targetTemperature?: number;
  coolingThresholdTemperature?: number;
}

export function userStatesEquivalent(
  left: UserState,
  right: UserState,
): boolean {
  for (const propName of [
    'masterSwitch',
    'autoMode',
    'heatingThresholdTemperature',
    'targetTemperature',
    'coolingThresholdTemperature',
  ] as const) {
    const leftValue = left[propName];
    const rightValue = right[propName];

    if (
      typeof leftValue === 'number' &&
      typeof rightValue === 'number' &&
      Number.isNaN(leftValue) &&
      Number.isNaN(rightValue)
    ) {
      continue;
    }

    if (leftValue !== rightValue) {
      return false;
    }
  }

  return true;
}
