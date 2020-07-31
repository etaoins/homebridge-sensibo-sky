import {
  restoreUserState,
  userStatesEquivalent,
  UserState,
  DEFAULT_USER_STATE,
} from './userState';

describe('userStatesEquivalent', () => {
  it('should consider identical states to be equivalent', () => {
    const state: UserState = {
      autoMode: true,
      heatingThresholdTemperature: 1.0,
      targetTemperature: 2.0,
      coolingThresholdTemperature: 3.0,
    };

    expect(userStatesEquivalent(state, state)).toBe(true);
  });

  it('should consider identical states including NaN to be equivalent', () => {
    const state: UserState = {
      autoMode: true,
      heatingThresholdTemperature: 1.0,
      targetTemperature: NaN,
      coolingThresholdTemperature: 3.0,
    };

    expect(userStatesEquivalent(state, state)).toBe(true);
  });

  it('should not consider different states to be equivalent', () => {
    const left: UserState = {
      autoMode: true,
      heatingThresholdTemperature: 1.0,
      targetTemperature: 2.0,
      coolingThresholdTemperature: 3.0,
    };

    const right: UserState = {
      autoMode: false,
      heatingThresholdTemperature: 4.0,
      targetTemperature: 5.0,
      coolingThresholdTemperature: 6.0,
    };

    expect(userStatesEquivalent(left, right)).toBe(false);
  });
});

describe('restoreUserState', () => {
  it('should return a default state without a user state directory', () => {
    expect(restoreUserState({}, 'Jest Sensibo')).toStrictEqual(
      DEFAULT_USER_STATE,
    );
  });

  it('should return a default state with a dubious device ID', () => {
    expect(
      restoreUserState(
        { userStateDirectory: '/does/not/exist' },
        '../../../etc/passwd',
      ),
    ).toStrictEqual(DEFAULT_USER_STATE);
  });

  it('should return a default state with a missing state file', () => {
    expect(
      restoreUserState(
        { userStateDirectory: '/does/not/exist' },
        'Jest Sensibo',
      ),
    ).toStrictEqual(DEFAULT_USER_STATE);
  });

  it('should return a default state with a state file with invalid JSON', () => {
    expect(
      restoreUserState(
        { userStateDirectory: './src/fixtures/userState' },
        'invalid',
      ),
    ).toStrictEqual(DEFAULT_USER_STATE);
  });

  it('should return a default state with a state file with non-object JSNON', () => {
    expect(
      restoreUserState(
        { userStateDirectory: './src/fixtures/userState' },
        'nonobject',
      ),
    ).toStrictEqual(DEFAULT_USER_STATE);
  });

  it('should return a saved state file with valid JSON', () => {
    expect(
      restoreUserState(
        { userStateDirectory: './src/fixtures/userState' },
        'valid',
      ),
    ).toMatchInlineSnapshot(`
      Object {
        "autoMode": false,
        "coolingThresholdTemperature": 6,
        "heatingThresholdTemperature": 4,
        "targetTemperature": 5,
      }
    `);
  });
});
