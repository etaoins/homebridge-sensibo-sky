import { shouldStartFanMode, shouldStopFanMode } from './outdoorAirBenefit';

describe('outdoorAirBenefit', () => {
  it('should stop fan when room, BOM & target match', () => {
    const input = {
      roomMeasurement: {
        temperature: 20,
        humidity: 50,
      },
      bomObservation: {
        temperature: 20,
        humidity: 50,
      },
      target: {
        temperature: 20,
        humidity: 50,
      },
    };

    expect(shouldStartFanMode(input)).toBe(false);
    expect(shouldStopFanMode(input)).toBe(true);
  });

  it('should stop fan when only temperature is a benefit', () => {
    const input = {
      roomMeasurement: {
        temperature: 18,
        humidity: 50,
      },
      bomObservation: {
        temperature: 22,
        humidity: 50,
      },
      target: {
        temperature: 20,
        humidity: 50,
      },
    };

    expect(shouldStartFanMode(input)).toBe(false);
    expect(shouldStopFanMode(input)).toBe(true);
  });

  it('should stop fan when only humidity is a benefit', () => {
    const input = {
      roomMeasurement: {
        temperature: 20,
        humidity: 60,
      },
      bomObservation: {
        temperature: 20,
        humidity: 40,
      },
      target: {
        temperature: 20,
        humidity: 50,
      },
    };

    expect(shouldStartFanMode(input)).toBe(false);
    expect(shouldStopFanMode(input)).toBe(true);
  });

  it('should keep fan state when humidity & temperature are slight benefits', () => {
    const input = {
      roomMeasurement: {
        temperature: 20.1,
        humidity: 51,
      },
      bomObservation: {
        temperature: 19.9,
        humidity: 49,
      },
      target: {
        temperature: 20,
        humidity: 50,
      },
    };

    expect(shouldStartFanMode(input)).toBe(false);
    expect(shouldStopFanMode(input)).toBe(false);
  });

  it('should stop fan when humidity & temperature are slight detriments', () => {
    const input = {
      roomMeasurement: {
        temperature: 20.1,
        humidity: 51,
      },
      bomObservation: {
        temperature: 20.1,
        humidity: 51,
      },
      target: {
        temperature: 20,
        humidity: 50,
      },
    };

    expect(shouldStartFanMode(input)).toBe(false);
    expect(shouldStopFanMode(input)).toBe(true);
  });

  it('should stop fan when only humidity is slight detriment', () => {
    const input = {
      roomMeasurement: {
        temperature: 20.1,
        humidity: 51,
      },
      bomObservation: {
        temperature: 19.9,
        humidity: 51,
      },
      target: {
        temperature: 20,
        humidity: 50,
      },
    };

    expect(shouldStartFanMode(input)).toBe(false);
    expect(shouldStopFanMode(input)).toBe(true);
  });

  it('should stop fan when only temperature is slight detriment', () => {
    const input = {
      roomMeasurement: {
        temperature: 20.1,
        humidity: 51,
      },
      bomObservation: {
        temperature: 20.1,
        humidity: 49,
      },
      target: {
        temperature: 20,
        humidity: 50,
      },
    };

    expect(shouldStartFanMode(input)).toBe(false);
    expect(shouldStopFanMode(input)).toBe(true);
  });

  it('should stop fan when humidity & temperature are signficant detriments', () => {
    const input = {
      roomMeasurement: {
        temperature: 30,
        humidity: 50,
      },
      bomObservation: {
        temperature: 40,
        humidity: 100,
      },
      target: {
        temperature: 20,
        humidity: 30,
      },
    };

    expect(shouldStartFanMode(input)).toBe(false);
    expect(shouldStopFanMode(input)).toBe(true);
  });

  it('should start fan when humidity & temperature are significant benefits', () => {
    const input = {
      roomMeasurement: {
        temperature: 25,
        humidity: 60,
      },
      bomObservation: {
        temperature: 15,
        humidity: 40,
      },
      target: {
        temperature: 20,
        humidity: 50,
      },
    };

    expect(shouldStartFanMode(input)).toBe(true);
    expect(shouldStopFanMode(input)).toBe(false);
  });
});
