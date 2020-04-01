import { shouldSwitchToFanMode, shouldStopFan } from './humidityController';

describe('shouldSwitchToFanMode', () => {
  it('should return false if room humidity is within range', () => {
    const log = jest.fn();

    const result = shouldSwitchToFanMode(log as any, {
      roomMeasurement: {
        humidity: 40,
        temperature: 21.0,
      },
      outdoorMeasurement: {
        humidity: 40,
        temperature: 21.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith('Room humidity is acceptable at 40%');
    expect(result).toBe(false);
  });

  it('should return false if room is too humid and outdoors is more humid', () => {
    const log = jest.fn();

    const result = shouldSwitchToFanMode(log as any, {
      roomMeasurement: {
        humidity: 51,
        temperature: 21.0,
      },
      outdoorMeasurement: {
        humidity: 60,
        temperature: 21.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Outdoor air is more humid at 60%; cannot dehumidify',
    );
    expect(result).toBe(false);
  });

  it('should return false if room is too dry and outdoors is more dry', () => {
    const log = jest.fn();

    const result = shouldSwitchToFanMode(log as any, {
      roomMeasurement: {
        humidity: 29,
        temperature: 21.0,
      },
      outdoorMeasurement: {
        humidity: 10,
        temperature: 21.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Outdoor air is more dry at 10%; cannot humidify',
    );
    expect(result).toBe(false);
  });

  it('should return true if room is too humid and outdoors is more dry', () => {
    const log = jest.fn();

    const result = shouldSwitchToFanMode(log as any, {
      roomMeasurement: {
        humidity: 51,
        temperature: 21.0,
      },
      outdoorMeasurement: {
        humidity: 20,
        temperature: 21.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith('Switching to fan mode to dehumidify');
    expect(result).toBe(true);
  });

  it('should return true if room is too dry and outdoors is more humid', () => {
    const log = jest.fn();

    const result = shouldSwitchToFanMode(log as any, {
      roomMeasurement: {
        humidity: 29,
        temperature: 21.0,
      },
      outdoorMeasurement: {
        humidity: 60,
        temperature: 21.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith('Switching to fan mode to humidify');
    expect(result).toBe(true);
  });

  it('should return false if the outdoor temperature is too cold', () => {
    const log = jest.fn();

    const result = shouldSwitchToFanMode(log as any, {
      roomMeasurement: {
        humidity: 51,
        temperature: 21.0,
      },
      outdoorMeasurement: {
        humidity: 20.0,
        temperature: 18.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledWith(
      'Outdoor air too cold at 18C; not dehumidifying',
    );
    expect(result).toBe(false);
  });

  it('should return false if the outdoor temperature is too hot', () => {
    const log = jest.fn();

    const result = shouldSwitchToFanMode(log as any, {
      roomMeasurement: {
        humidity: 29,
        temperature: 21.0,
      },
      outdoorMeasurement: {
        humidity: 60,
        temperature: 24.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledWith('Outdoor air too hot at 24C; not humidifying');
    expect(result).toBe(false);
  });
});

describe('shouldStopFan', () => {
  it('should return false if within normal range and still effectively dehumidifying', () => {
    const log = jest.fn();

    const result = shouldStopFan(log as any, {
      roomMeasurement: {
        humidity: 49,
        temperature: 21.0,
      },
      outdoorMeasurement: {
        humidity: 40,
        temperature: 21.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledTimes(0);
    expect(result).toBe(false);
  });

  it('should return true if within normal range and not effectively dehumidifying', () => {
    const log = jest.fn();

    const result = shouldStopFan(log as any, {
      roomMeasurement: {
        humidity: 49,
        temperature: 21.0,
      },
      outdoorMeasurement: {
        humidity: 50,
        temperature: 21.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      'Outdoor air is too humid at 50%; stopping fan',
    );
    expect(result).toBe(true);
  });

  it('should return false if out of normal range and still effectively humidifying', () => {
    const log = jest.fn();

    const result = shouldStopFan(log as any, {
      roomMeasurement: {
        humidity: 10,
        temperature: 21.0,
      },
      outdoorMeasurement: {
        humidity: 40,
        temperature: 21.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledTimes(0);
    expect(result).toBe(false);
  });

  it('should return true if within normal range and not effectively humidifying', () => {
    const log = jest.fn();

    const result = shouldStopFan(log as any, {
      roomMeasurement: {
        humidity: 35,
        temperature: 21.0,
      },
      outdoorMeasurement: {
        humidity: 10,
        temperature: 21.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      'Outdoor air is too dry at 10%; stopping fan',
    );
    expect(result).toBe(true);
  });

  it('should return true if still effectively humidifying and both the room & outdoor air are too cold', () => {
    const log = jest.fn();

    const result = shouldStopFan(log as any, {
      roomMeasurement: {
        humidity: 10,
        temperature: 20.0,
      },
      outdoorMeasurement: {
        humidity: 40,
        temperature: 17.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith('Outdoor air too cold at 17C; stopping fan');
    expect(result).toBe(true);
  });

  it('should return false if still effectively humidifying and just the outdoor air is too cold', () => {
    const log = jest.fn();

    const result = shouldStopFan(log as any, {
      roomMeasurement: {
        humidity: 10,
        temperature: 22.0,
      },
      outdoorMeasurement: {
        humidity: 40,
        temperature: 17.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledTimes(0);
    expect(result).toBe(false);
  });

  it('should return true if still effectively dehumidifying and both the room & outdoor air are too hot', () => {
    const log = jest.fn();

    const result = shouldStopFan(log as any, {
      roomMeasurement: {
        humidity: 40,
        temperature: 22.0,
      },
      outdoorMeasurement: {
        humidity: 30,
        temperature: 24.0,
      },
      heatingThresholdTemperature: 19.0,
      coolingThresholdTemperature: 23.0,
    });

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith('Outdoor air too hot at 24C; stopping fan');
    expect(result).toBe(true);
  });
});
