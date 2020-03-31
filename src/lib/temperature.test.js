const { clampTemperature, fahrenheitToCelsius } = require('./temperature');

describe('clampTemperature', () => {
  it('should pass through an in-range temperature', () => {
    expect(
      clampTemperature(15.0, { minValue: 10.0, maxValue: 30.0, minStep: 0.5 }),
    ).toEqual(15.0);
  });

  it('should round an in-range temperature with minStep of 1', () => {
    expect(
      clampTemperature(16.5, { minValue: 10.0, maxValue: 30.0, minStep: 1.0 }),
    ).toEqual(17.0);
  });

  it('should not round an in-range temperature with minStep of 0.5', () => {
    expect(
      clampTemperature(16.5, { minValue: 10.0, maxValue: 30.0, minStep: 0.5 }),
    ).toEqual(16.5);
  });

  it('clamp a temperature below the minimum value', () => {
    expect(
      clampTemperature(5.0, { minValue: 10.0, maxValue: 30.0, minStep: 0.5 }),
    ).toEqual(10.0);
  });

  it('clamp a temperature above the maximum value', () => {
    expect(
      clampTemperature(35.0, { minValue: 10.0, maxValue: 30.0, minStep: 0.5 }),
    ).toEqual(30.0);
  });
});

describe('fahrenheitToCelsius', () => {
  it('should handle below freezing temperatures', () => {
    expect(fahrenheitToCelsius(14)).toEqual(-10);
  });

  it('should handle freezing point', () => {
    expect(fahrenheitToCelsius(32)).toEqual(0);
  });

  it('should handle above freezing temperatures', () => {
    expect(fahrenheitToCelsius(50)).toEqual(10);
  });
});
