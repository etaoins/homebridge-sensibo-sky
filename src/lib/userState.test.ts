import { userStatesEquivalent, UserState } from './userState';

describe('userStatesEquivalent', () => {
  it('should consider identical states to be equivalent', () => {
    const state: UserState = {
      masterSwitch: true,
      autoMode: true,
      heatingThresholdTemperature: 1.0,
      targetTemperature: 2.0,
      coolingThresholdTemperature: 3.0,
    };

    expect(userStatesEquivalent(state, state)).toBe(true);
  });

  it('should consider identical states including NaN to be equivalent', () => {
    const state: UserState = {
      masterSwitch: true,
      autoMode: true,
      heatingThresholdTemperature: 1.0,
      targetTemperature: NaN,
      coolingThresholdTemperature: 3.0,
    };

    expect(userStatesEquivalent(state, state)).toBe(true);
  });

  it('should not consider different states to be equivalent', () => {
    const left: UserState = {
      masterSwitch: true,
      autoMode: true,
      heatingThresholdTemperature: 1.0,
      targetTemperature: 2.0,
      coolingThresholdTemperature: 3.0,
    };

    const right: UserState = {
      masterSwitch: false,
      autoMode: false,
      heatingThresholdTemperature: 4.0,
      targetTemperature: 5.0,
      coolingThresholdTemperature: 6.0,
    };

    expect(userStatesEquivalent(left, right)).toBe(false);
  });
});
