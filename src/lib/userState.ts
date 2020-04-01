import fs from 'fs';
import { Config } from './config';

export interface UserState {
  masterSwitch: boolean;
  autoMode: boolean;
  heatingThresholdTemperature?: number;
  targetTemperature?: number;
  coolingThresholdTemperature?: number;
}

export const DEFAULT_USER_STATE: UserState = {
  masterSwitch: true,
  autoMode: false,
  heatingThresholdTemperature: undefined,
  targetTemperature: undefined,
  coolingThresholdTemperature: undefined,
};

function userStateFilename(
  config: Pick<Config, 'userStateDirectory'>,
  deviceId: string,
): string | undefined {
  if (!config.userStateDirectory) {
    return;
  }

  if (/[\.\/\0]/.test(deviceId)) {
    // Weird device ID
    return;
  }

  return `${config.userStateDirectory}/SensiboUserState.${deviceId}.json`;
}

export function restoreUserState(
  config: Pick<Config, 'userStateDirectory'>,
  deviceId: string,
): UserState {
  const filename = userStateFilename(config, deviceId);
  if (!filename) {
    return DEFAULT_USER_STATE;
  }

  try {
    // eslint-disable-next-line no-sync
    const fileContent = fs.readFileSync(filename, { encoding: 'utf8' });
    return {
      ...DEFAULT_USER_STATE,
      ...JSON.parse(fileContent),
    };
  } catch {
    return DEFAULT_USER_STATE;
  }
}

// istanbul ignore next
export function saveUserState(
  config: Pick<Config, 'userStateDirectory'>,
  deviceId: string,
  userState: UserState,
) {
  const filename = userStateFilename(config, deviceId);
  if (!filename) {
    return;
  }

  try {
    // eslint-disable-next-line no-sync
    fs.writeFileSync(filename, JSON.stringify(userState, null, 2), {
      encoding: 'utf8',
    });
  } catch {}
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
