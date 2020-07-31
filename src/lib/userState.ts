import fs from 'fs';
import { Config } from './config';
import { TARGET_TEMPERATURE_RANGE } from './temperature';

export interface UserState {
  autoMode: boolean;
  heatingThresholdTemperature: number;
  targetTemperature?: number;
  coolingThresholdTemperature: number;
}

export const DEFAULT_USER_STATE: UserState = {
  autoMode: false,
  heatingThresholdTemperature: TARGET_TEMPERATURE_RANGE.minValue,
  targetTemperature: undefined,
  coolingThresholdTemperature: TARGET_TEMPERATURE_RANGE.maxValue,
};

const userStateFilename = (
  config: Pick<Config, 'userStateDirectory'>,
  deviceId: string,
): string | undefined => {
  if (!config.userStateDirectory) {
    return;
  }

  if (/[\.\/\0]/.test(deviceId)) {
    // Weird device ID
    return;
  }

  return `${config.userStateDirectory}/SensiboUserState.${deviceId}.json`;
};

export const restoreUserState = (
  config: Pick<Config, 'userStateDirectory'>,
  deviceId: string,
): UserState => {
  const filename = userStateFilename(config, deviceId);
  if (!filename) {
    return DEFAULT_USER_STATE;
  }

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(
      // eslint-disable-next-line no-sync
      fs.readFileSync(filename, { encoding: 'utf8' }),
    ) as unknown;
  } catch {
    return DEFAULT_USER_STATE;
  }

  if (typeof parsedContent !== 'object') {
    return DEFAULT_USER_STATE;
  }

  return {
    ...DEFAULT_USER_STATE,
    ...parsedContent,
  };
};

// istanbul ignore next
export const saveUserState = (
  config: Pick<Config, 'userStateDirectory'>,
  deviceId: string,
  userState: UserState,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const filename = userStateFilename(config, deviceId);
    if (!filename) {
      resolve();
      return;
    }

    try {
      const fileContent = JSON.stringify(userState, null, 2);

      fs.writeFile(filename, fileContent, { encoding: 'utf8' }, (err) =>
        err ? reject(err) : resolve(),
      );
    } catch (err) {
      reject(err);
    }
  });

export const userStatesEquivalent = (
  left: UserState,
  right: UserState,
): boolean => {
  for (const propName of [
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
};
