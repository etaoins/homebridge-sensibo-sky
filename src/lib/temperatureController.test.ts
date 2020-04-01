import { calculateDesiredAcState } from './temperatureController';
import { AcState } from './acState';
import * as humidityController from './humidityController';

const MOCK_AC_STATE: AcState = {
  on: true,
  mode: 'heat',
  temperatureUnit: 'C',
  targetTemperature: 21.0,
  fanLevel: 'low',
};

describe('calculateDesiredAcState', () => {
  afterEach(() => jest.restoreAllMocks());

  it('should do nothing if the temperature is in range and the unit is off', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 21.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false },
    );

    expect(log).toBeCalledTimes(1);
    expect(nextState).toMatchObject({ on: false });
  });

  it('should heat on low if the temperature is 1C below range and the unit is off', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 18.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false },
    );

    expect(log).toBeCalledTimes(2);
    expect(log).toBeCalledWith(
      'Colder than heating threshold, switching to hot mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'low',
      mode: 'heat',
      on: true,
      targetTemperature: 23,
    });
  });

  it('should heat on medium if the temperature is 2C below range and the unit is cooling', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 17.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'cool' },
    );

    expect(log).toBeCalledTimes(2);
    expect(log).toBeCalledWith(
      'Colder than heating threshold, switching to hot mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'medium',
      mode: 'heat',
      on: true,
      targetTemperature: 23,
    });
  });

  it('should heat on high if the temperature is 5C below range and the unit is off', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 14.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false },
    );

    expect(log).toBeCalledTimes(2);
    expect(log).toBeCalledWith(
      'Colder than heating threshold, switching to hot mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'high',
      mode: 'heat',
      on: true,
      targetTemperature: 23,
    });
  });

  it('should do nothing if the temperature is below range and the unit is heating', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 14.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'heat' },
    );

    expect(log).toBeCalledTimes(1);
    expect(nextState).toMatchObject({
      fanLevel: 'high',
      mode: 'heat',
      on: true,
      targetTemperature: 23,
    });
  });

  it('should cool on medium if the temperature is 3C above range and the unit is off', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 26.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false },
    );

    expect(log).toBeCalledTimes(2);
    expect(log).toBeCalledWith(
      'Hotter than cooling threshold, switching to cool mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'medium',
      mode: 'cool',
      on: true,
      targetTemperature: 19,
    });
  });

  it('should cool on high if the temperature is 5C above range and the unit is heating', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 28.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'heat' },
    );

    expect(log).toBeCalledTimes(2);
    expect(log).toBeCalledWith(
      'Hotter than cooling threshold, switching to cool mode',
    );
    expect(nextState).toMatchObject({
      fanLevel: 'high',
      mode: 'cool',
      on: true,
      targetTemperature: 19,
    });
  });

  it('should do nothing if the temperature is above range and the unit is cooling', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 26.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'cool' },
    );

    expect(log).toBeCalledTimes(1);
    expect(nextState).toMatchObject({
      fanLevel: 'medium',
      mode: 'cool',
      on: true,
      targetTemperature: 19,
    });
  });

  it('should do nothing if cooling while hotter than target temperature', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 22.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'cool' },
    );

    expect(log).toBeCalledTimes(1);
    expect(nextState).toMatchObject({
      mode: 'cool',
      on: true,
    });
  });

  it('should do nothing if heating while cooler than target temperature', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 20.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'heat' },
    );

    expect(log).toBeCalledTimes(1);
    expect(nextState).toMatchObject({
      mode: 'heat',
      on: true,
    });
  });

  it('should turn off if cooling while cooler than target temperature', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 20.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'cool' },
    );

    expect(log).toBeCalledTimes(2);
    expect(log).toBeCalledWith('Crossed temperature mid-point, switching off');
    expect(nextState).toMatchObject({
      mode: 'cool',
      on: false,
    });
  });

  it('should turn off if heating while hotter than target temperature', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 22.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'heat' },
    );

    expect(log).toBeCalledTimes(2);
    expect(log).toBeCalledWith('Crossed temperature mid-point, switching off');
    expect(nextState).toMatchObject({
      mode: 'heat',
      on: false,
    });
  });

  it('should do nothing while crossing the target temperature while off', () => {
    const log = jest.fn();

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 22.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: false, mode: 'heat' },
    );

    expect(log).toBeCalledTimes(1);
    expect(nextState).toMatchObject({
      mode: 'heat',
      on: false,
    });
  });

  it('should allow the humidity controller to switch to fan mode when crossing the temperature threshold', () => {
    const log = jest.fn();
    const shouldSwitchToFanModeSpy = jest
      .spyOn(humidityController, 'shouldSwitchToFanMode')
      .mockReturnValue(true);

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 60,
          temperature: 22.0,
        },
        outdoorMeasurement: {
          humidity: 40,
          temperature: 22.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'heat' },
    );

    expect(log).toBeCalledTimes(1);
    expect(shouldSwitchToFanModeSpy).toBeCalledTimes(1);

    expect(nextState).toMatchObject({
      on: true,
      mode: 'fan',
      fanLevel: 'low',
    });
  });

  it('should allow the humidity controller to not switch to fan mode when crossing the temperature threshold', () => {
    const log = jest.fn();
    const shouldSwitchToFanModeSpy = jest
      .spyOn(humidityController, 'shouldSwitchToFanMode')
      .mockReturnValue(false);

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 40,
          temperature: 20.0,
        },
        outdoorMeasurement: {
          humidity: 89,
          temperature: 22.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'cool' },
    );

    expect(log).toBeCalledTimes(2);
    expect(log).toBeCalledWith('Crossed temperature mid-point, switching off');

    expect(shouldSwitchToFanModeSpy).toBeCalledTimes(1);

    expect(nextState).toMatchObject({
      mode: 'cool',
      on: false,
    });
  });

  it('should allow the humidity controller to stop the fan while in fan mode', () => {
    const log = jest.fn();
    const shouldStopFanSpy = jest
      .spyOn(humidityController, 'shouldStopFan')
      .mockReturnValue(true);

    const nextState = calculateDesiredAcState(
      log as any,
      {
        roomMeasurement: {
          humidity: 60,
          temperature: 22.0,
        },
        outdoorMeasurement: {
          humidity: 40,
          temperature: 22.0,
        },
        heatingThresholdTemperature: 19.0,
        coolingThresholdTemperature: 23.0,
      },
      { ...MOCK_AC_STATE, on: true, mode: 'fan' },
    );

    expect(log).toBeCalledTimes(1);
    expect(shouldStopFanSpy).toBeCalledTimes(1);

    expect(nextState).toMatchObject({
      on: false,
    });
  });
});
