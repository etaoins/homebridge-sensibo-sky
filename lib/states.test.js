const { statesEquivalent } = require('./states');

describe('statesEquivalent', () => {
  it('should consider identical states to be equivalent', () => {
    const state = {
      on: true,
      mode: 'cool',
      targetTemperature: 25.0,
      fanLevel: 'low',
    };

    expect(statesEquivalent(state, state)).toBe(true);
  });

  it('should consider different off states to be equivalent', () => {
    const left = {
      on: false,
      mode: 'cool',
      targetTemperature: 25.0,
      fanLevel: 'low',
    };

    const right = {
      on: false,
      mode: 'heat',
      targetTemperature: 17.0,
      fanLevel: 'high',
    };

    expect(statesEquivalent(left, right)).toBe(true);
  });

  it('should not consider on states with different modes to be equivalent', () => {
    const left = {
      on: true,
      mode: 'cool',
      targetTemperature: 21.0,
      fanLevel: 'low',
    };

    const right = {
      on: true,
      mode: 'heat',
      targetTemperature: 21.0,
      fanLevel: 'low',
    };

    expect(statesEquivalent(left, right)).toBe(false);
  });

  it('should not consider on states with different target temperatures to be equivalent', () => {
    const left = {
      on: true,
      mode: 'heat',
      targetTemperature: 22.0,
      fanLevel: 'low',
    };

    const right = {
      on: true,
      mode: 'heat',
      targetTemperature: 21.0,
      fanLevel: 'low',
    };

    expect(statesEquivalent(left, right)).toBe(false);
  });

  it('should not consider on states with different fan levels to be equivalent', () => {
    const left = {
      on: true,
      mode: 'heat',
      targetTemperature: 21.0,
      fanLevel: 'low',
    };

    const right = {
      on: true,
      mode: 'heat',
      targetTemperature: 21.0,
      fanLevel: 'high',
    };

    expect(statesEquivalent(left, right)).toBe(false);
  });
});
