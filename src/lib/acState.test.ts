import { acStatesEquivalent, AcState } from './acState';

describe('acStatesEquivalent', () => {
  it('should consider identical states to be equivalent', () => {
    const state: AcState = {
      on: true,
      mode: 'cool',
      temperatureUnit: 'C',
      targetTemperature: 25.0,
      fanLevel: 'low',
    };

    expect(acStatesEquivalent(state, state)).toBe(true);
  });

  it('should consider different off states to be equivalent', () => {
    const left: AcState = {
      on: false,
      mode: 'cool',
      temperatureUnit: 'C',
      targetTemperature: 25.0,
      fanLevel: 'low',
    };

    const right: AcState = {
      on: false,
      mode: 'heat',
      temperatureUnit: 'C',
      targetTemperature: 17.0,
      fanLevel: 'high',
    };

    expect(acStatesEquivalent(left, right)).toBe(true);
  });

  it('should not consider on states with different modes to be equivalent', () => {
    const left: AcState = {
      on: true,
      mode: 'cool',
      temperatureUnit: 'C',
      targetTemperature: 21.0,
      fanLevel: 'low',
    };

    const right: AcState = {
      on: true,
      mode: 'heat',
      temperatureUnit: 'C',
      targetTemperature: 21.0,
      fanLevel: 'low',
    };

    expect(acStatesEquivalent(left, right)).toBe(false);
  });

  it('should not consider on states with different target temperatures to be equivalent', () => {
    const left: AcState = {
      on: true,
      mode: 'heat',
      temperatureUnit: 'C',
      targetTemperature: 22.0,
      fanLevel: 'low',
    };

    const right: AcState = {
      on: true,
      mode: 'heat',
      temperatureUnit: 'C',
      targetTemperature: 21.0,
      fanLevel: 'low',
    };

    expect(acStatesEquivalent(left, right)).toBe(false);
  });

  it('should not consider on states with different fan levels to be equivalent', () => {
    const left: AcState = {
      on: true,
      mode: 'heat',
      temperatureUnit: 'C',
      targetTemperature: 21.0,
      fanLevel: 'low',
    };

    const right: AcState = {
      on: true,
      mode: 'heat',
      temperatureUnit: 'C',
      targetTemperature: 21.0,
      fanLevel: 'high',
    };

    expect(acStatesEquivalent(left, right)).toBe(false);
  });
});
