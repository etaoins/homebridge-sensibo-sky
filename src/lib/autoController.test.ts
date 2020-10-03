import * as Homebridge from 'homebridge';

import { calculateDesiredAcState } from './autoController';
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

  describe('idle states', () => {
    it('should do nothing if the temperature & humidity is in range and the unit is off', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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

      expect(desiredState).toBe(false);
    });

    it('should do nothing if the temperature & humidity is in range and the unit is in auto mode', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
        log,
        {
          roomMeasurement: {
            temperature: 21.0,
            humidity: 40,
          },
          heatingThresholdTemperature: 19.0,
          coolingThresholdTemperature: 23.0,
        },
        { ...MOCK_AC_STATE, on: true, mode: 'auto' },
      );

      expect(desiredState).toBe(false);
    });
  });

  it('should do nothing if the temperature & humidity is in range and the unit is in fan mode', () => {
    const log = mockLogging();

    const desiredState = calculateDesiredAcState(
      log,
      {
        roomMeasurement: {
          temperature: 21.0,
          humidity: 40,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'fan' },
    );

    expect(desiredState).toBe(false);
  });

  describe('heating', () => {
    it('should heat on low if the temperature is 1C below range and the unit is off', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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
        'Colder (18) than heating threshold (19), starting heat mode',
      );

      expect(desiredState).toMatchObject({
        fanLevel: 'low',
        mode: 'heat',
        on: true,
        targetTemperature: 23,
      });
    });

    it('should heat on medium if the temperature is 2C below range and the unit is cooling', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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

      expect(log).toBeCalledTimes(2);
      expect(log).toBeCalledWith('Cooled (17) to temperature mid-point (21)');
      expect(log).toBeCalledWith(
        'Colder (17) than heating threshold (19), starting heat mode',
      );

      expect(desiredState).toMatchObject({
        fanLevel: 'medium',
        mode: 'heat',
        on: true,
        targetTemperature: 23,
      });
    });

    it('should heat on high if the temperature is 5C below range and the unit is off', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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
        'Colder (14) than heating threshold (19), starting heat mode',
      );

      expect(desiredState).toMatchObject({
        fanLevel: 'high',
        mode: 'heat',
        on: true,
        targetTemperature: 23,
      });
    });

    it('should heat on strong if the temperature is 8C below range and the unit is off', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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
        'Colder (11) than heating threshold (19), starting heat mode',
      );

      expect(desiredState).toMatchObject({
        fanLevel: 'strong',
        mode: 'heat',
        on: true,
        targetTemperature: 23,
      });
    });

    it('should do nothing if the temperature is 1C below range and the unit is heating', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
        log,
        {
          roomMeasurement: {
            temperature: 18.0,
            humidity: 40,
          },
          heatingThresholdTemperature: 19.0,
          coolingThresholdTemperature: 23.0,
        },
        { ...MOCK_AC_STATE, on: true, mode: 'heat' },
      );

      expect(log).not.toBeCalled();
      expect(desiredState).toBe(false);
    });

    it('should increase the fan speed if the temperature is 2C below range and the unit is heating on low', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
        log,
        {
          roomMeasurement: {
            temperature: 17.0,
            humidity: 40,
          },
          heatingThresholdTemperature: 19.0,
          coolingThresholdTemperature: 23.0,
        },
        { ...MOCK_AC_STATE, on: true, mode: 'heat', fanLevel: 'low' },
      );

      expect(log).toBeCalledTimes(1);
      expect(log).toBeCalledWith(
        'Heating on low is ineffective; boosting to medium',
      );

      expect(desiredState).toMatchObject({
        on: true,
        mode: 'heat',
        fanLevel: 'medium',
      });
    });

    it('should do nothing if heating while cooler than target temperature', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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
      expect(desiredState).toBe(false);
    });

    it('should turn off if heating while hotter than target temperature', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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

      expect(log).toBeCalledTimes(2);
      expect(log).toBeCalledWith('Heated (22) to temperature mid-point (21)');
      expect(log).toBeCalledWith(
        'Reached goal with nothing else to do; switching off',
      );

      expect(desiredState).toMatchObject({
        on: false,
      });
    });
  });

  describe('cooling', () => {
    it('should cool on low if the temperature is 1C above range and the unit is off', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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
        'Hotter (24) than cooling threshold (23), starting cool mode',
      );
      expect(desiredState).toMatchObject({
        fanLevel: 'low',
        mode: 'cool',
        on: true,
        targetTemperature: 19,
      });
    });

    it('should cool on medium if the temperature is 3C above range and the unit is off', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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
        'Hotter (26) than cooling threshold (23), starting cool mode',
      );
      expect(desiredState).toMatchObject({
        fanLevel: 'medium',
        mode: 'cool',
        on: true,
        targetTemperature: 19,
      });
    });

    it('should cool on high if the temperature is 5C above range and the unit is heating', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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

      expect(log).toBeCalledTimes(2);
      expect(log).toBeCalledWith('Heated (28) to temperature mid-point (21)');
      expect(log).toBeCalledWith(
        'Hotter (28) than cooling threshold (23), starting cool mode',
      );

      expect(desiredState).toMatchObject({
        fanLevel: 'high',
        mode: 'cool',
        on: true,
        targetTemperature: 19,
      });
    });

    it('should cool on strong if the temperature is 8C above range and the unit is heating', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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

      expect(log).toBeCalledTimes(2);
      expect(log).toBeCalledWith('Heated (31) to temperature mid-point (21)');
      expect(log).toBeCalledWith(
        'Hotter (31) than cooling threshold (23), starting cool mode',
      );

      expect(desiredState).toMatchObject({
        fanLevel: 'strong',
        mode: 'cool',
        on: true,
        targetTemperature: 19,
      });
    });

    it('should do nothing if the temperature is 1C above range and the unit is cooling', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
        log,
        {
          roomMeasurement: {
            temperature: 24.0,
            humidity: 40,
          },
          heatingThresholdTemperature: 19.0,
          coolingThresholdTemperature: 23.0,
        },
        { ...MOCK_AC_STATE, on: true, mode: 'cool' },
      );

      expect(log).not.toBeCalled();
      expect(desiredState).toBe(false);
    });

    it('should increase the fan speed if the temperature is 2C above range and the unit is cooling on low', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
        log,
        {
          roomMeasurement: {
            temperature: 25.0,
            humidity: 40,
          },
          heatingThresholdTemperature: 19.0,
          coolingThresholdTemperature: 23.0,
        },
        { ...MOCK_AC_STATE, on: true, mode: 'cool' },
      );

      expect(log).toBeCalledTimes(1);
      expect(log).toBeCalledWith(
        'Cooling on low is ineffective; boosting to medium',
      );

      expect(desiredState).toMatchObject({
        on: true,
        mode: 'cool',
        fanLevel: 'medium',
      });
    });

    it('should do nothing if cooling while hotter than target temperature', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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
      expect(desiredState).toBe(false);
    });

    it('should turn off if cooling while cooler than target temperature', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
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

      expect(log).toBeCalledTimes(2);
      expect(log).toBeCalledWith('Cooled (20) to temperature mid-point (21)');
      expect(log).toBeCalledWith(
        'Reached goal with nothing else to do; switching off',
      );

      expect(desiredState).toMatchObject({
        on: false,
      });
    });
  });

  describe('drying', () => {
    it('should dry if more humid than drying threshold', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
        log,
        {
          roomMeasurement: {
            temperature: 21.0,
            humidity: 60,
          },
          heatingThresholdTemperature: 19.0,
          coolingThresholdTemperature: 23.0,
        },
        { ...MOCK_AC_STATE, on: false },
      );

      expect(log).toBeCalledTimes(1);
      expect(log).toBeCalledWith(
        'More humid (60) than drying threshold (50), starting dry mode',
      );

      expect(desiredState).toMatchObject({
        mode: 'dry',
        on: true,
      });
    });

    it('should do nothing if the humidity is above range and the unit is drying', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
        log,
        {
          roomMeasurement: {
            temperature: 21.0,
            humidity: 60,
          },
          heatingThresholdTemperature: 19.0,
          coolingThresholdTemperature: 23.0,
        },
        { ...MOCK_AC_STATE, on: true, mode: 'dry' },
      );

      expect(log).not.toBeCalled();
      expect(desiredState).toBe(false);
    });

    it('should do nothing if drying while more humid than humidity mid-point', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
        log,
        {
          roomMeasurement: {
            temperature: 22.0,
            humidity: 40,
          },
          heatingThresholdTemperature: 19.0,
          coolingThresholdTemperature: 23.0,
        },
        { ...MOCK_AC_STATE, on: true, mode: 'dry' },
      );

      expect(log).not.toBeCalled();
      expect(desiredState).toBe(false);
    });

    it('should turn off if drying while drier than target humidity', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
        log as any,
        {
          roomMeasurement: {
            temperature: 21.0,
            humidity: 20,
          },
          heatingThresholdTemperature: 19.0,
          coolingThresholdTemperature: 23.0,
        },
        { ...MOCK_AC_STATE, on: true, mode: 'dry' },
      );

      expect(log).toBeCalledTimes(2);
      expect(log).toBeCalledWith('Dried (20) to humidity mid-point (40)');
      expect(log).toBeCalledWith(
        'Reached goal with nothing else to do; switching off',
      );

      expect(desiredState).toMatchObject({
        on: false,
      });
    });

    it('should do switch to heat mode if drying while humidity is in range and temperature is below range', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
        log,
        {
          roomMeasurement: {
            temperature: 18.0,
            humidity: 50,
          },
          heatingThresholdTemperature: 19.0,
          coolingThresholdTemperature: 23.0,
        },
        { ...MOCK_AC_STATE, on: true, mode: 'dry' },
      );

      expect(log).toBeCalledTimes(1);
      expect(log).toBeCalledWith(
        'Colder (18) than heating threshold (19), starting heat mode',
      );

      expect(desiredState).toMatchObject({
        fanLevel: 'low',
        mode: 'heat',
        on: true,
        targetTemperature: 23,
      });
    });

    it('should do switch to cool mode if drying while humidity is in range and temperature is above range', () => {
      const log = mockLogging();

      const desiredState = calculateDesiredAcState(
        log,
        {
          roomMeasurement: {
            temperature: 24.0,
            humidity: 50,
          },
          heatingThresholdTemperature: 19.0,
          coolingThresholdTemperature: 23.0,
        },
        { ...MOCK_AC_STATE, on: true, mode: 'dry' },
      );

      expect(log).toBeCalledTimes(1);
      expect(log).toBeCalledWith(
        'Hotter (24) than cooling threshold (23), starting cool mode',
      );

      expect(desiredState).toMatchObject({
        fanLevel: 'low',
        mode: 'cool',
        on: true,
        targetTemperature: 19,
      });
    });
  });
});
