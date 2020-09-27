import * as Homebridge from 'homebridge';

import { calculateDesiredAcState } from './temperatureController';
import { AcState } from './acState';

const MOCK_AC_STATE: AcState = {
  on: true,
  mode: 'heat',
  temperatureUnit: 'C',
  targetTemperature: 21.0,
  fanLevel: 'low',
};

const mockLogging = (): Homebridge.Logging => {
  const log = jest.fn();

  Object.assign(log, {
    debug: jest.fn(),
    info: jest.fn(),
    log,
    warn: jest.fn(),
    error: jest.fn(),
  });

  return (log as unknown) as Homebridge.Logging;
};

describe('calculateDesiredAcState', () => {
  afterEach(() => jest.restoreAllMocks());

  it('should do nothing if the temperature is in range and the unit is off', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 21.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false },
    );

    expect(nextState).toMatchObject({ on: false });
  });

  it('should heat on low if the temperature is 1C below range and the unit is off', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 18.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false },
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Colder (18) than heating threshold (19), switching to heat mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'low',
      mode: 'heat',
      on: true,
      targetTemperature: 23,
    });
  });

  it('should heat on medium if the temperature is 2C below range and the unit is cooling', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 17.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'cool' },
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Colder (17) than heating threshold (19), switching to heat mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'medium',
      mode: 'heat',
      on: true,
      targetTemperature: 23,
    });
  });

  it('should heat on high if the temperature is 5C below range and the unit is off', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 14.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false },
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Colder (14) than heating threshold (19), switching to heat mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'high',
      mode: 'heat',
      on: true,
      targetTemperature: 23,
    });
  });

  it('should heat on strong if the temperature is 8C below range and the unit is off', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 11.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false },
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Colder (11) than heating threshold (19), switching to heat mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'strong',
      mode: 'heat',
      on: true,
      targetTemperature: 23,
    });
  });

  it('should do nothing if the temperature is below range and the unit is heating', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 14.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'heat' },
    );

    expect(log).not.toBeCalled();
    expect(nextState).toMatchObject({
      fanLevel: 'high',
      mode: 'heat',
      on: true,
      targetTemperature: 23,
    });
  });

  it('should dry if the temperature is 1C above range, humidity is above range and the unit is off', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 24.0,
          humidity: 80,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false },
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Hotter (24) than cooling threshold (23), switching to dry mode',
    );
    expect(nextState).toMatchObject({
      mode: 'dry',
      on: true,
      targetTemperature: 19,
    });
  });

  it('should cool on low if the temperature is 1C above range, humidity is within range and the unit is off', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 24.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false },
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Hotter (24) than cooling threshold (23), switching to cool mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'low',
      mode: 'cool',
      on: true,
      targetTemperature: 19,
    });
  });

  it('should cool on medium if the temperature is 3C above range and the unit is off', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 26.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false },
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Hotter (26) than cooling threshold (23), switching to cool mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'medium',
      mode: 'cool',
      on: true,
      targetTemperature: 19,
    });
  });

  it('should cool on high if the temperature is 5C above range and the unit is heating', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 28.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'heat' },
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Hotter (28) than cooling threshold (23), switching to cool mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'high',
      mode: 'cool',
      on: true,
      targetTemperature: 19,
    });
  });

  it('should cool on strong if the temperature is 8C above range and the unit is heating', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 31.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'heat' },
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Hotter (31) than cooling threshold (23), switching to cool mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'strong',
      mode: 'cool',
      on: true,
      targetTemperature: 19,
    });
  });

  it('should do nothing if the temperature is above range and the unit is cooling', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 26.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'cool' },
    );

    expect(log).not.toBeCalled();
    expect(nextState).toMatchObject({
      fanLevel: 'medium',
      mode: 'cool',
      on: true,
      targetTemperature: 19,
    });
  });

  it('should do nothing if cooling while hotter than target temperature', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 22.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'cool' },
    );

    expect(log).not.toBeCalled();
    expect(nextState).toMatchObject({
      mode: 'cool',
      on: true,
    });
  });

  it('should do nothing if heating while cooler than target temperature', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 20.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'heat' },
    );

    expect(log).not.toBeCalled();
    expect(nextState).toMatchObject({
      mode: 'heat',
      on: true,
    });
  });

  it('should turn off if cooling while cooler than target temperature', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          temperature: 20.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'cool' },
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Crossed (20) temperature mid-point (21), switching off',
    );
    expect(nextState).toMatchObject({
      mode: 'cool',
      on: false,
    });
  });

  it('should turn off if heating while hotter than target temperature', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 22.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'heat' },
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Crossed (22) temperature mid-point (21), switching off',
    );
    expect(nextState).toMatchObject({
      mode: 'heat',
      on: false,
    });
  });

  it('should do nothing while crossing the target temperature while off', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 22.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false, mode: 'heat' },
    );

    expect(log).not.toBeCalled();
    expect(nextState).toMatchObject({
      mode: 'heat',
      on: false,
    });
  });

  it('should switch to cool mode if drying below the minimum humidity', () => {
    const log = mockLogging();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          temperature: 22.0,
          humidity: 35,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'dry' },
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith(
      'Dried (35) to humidity mid-point (40), switching to cool mode',
    );
    expect(nextState).toMatchObject({
      mode: 'cool',
      fanLevel: 'low',
      on: true,
    });
  });
});
