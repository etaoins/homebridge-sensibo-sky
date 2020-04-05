import { pollNextMeasurementInMs } from './measurement';

describe('pollNextMeasurementInMs', () => {
  it('should return the minimum interval when there is no previous measurement', () => {
    const log = jest.fn();

    expect(pollNextMeasurementInMs(log as any)).toEqual(30_000);

    expect(log).toBeCalledTimes(0);
  });

  it('should return the minimum interval when `secondsAgo` is NaN', () => {
    const log = jest.fn();

    const PREV_MEASUREMENT = {
      time: {
        secondsAgo: NaN,
        time: new Date().toISOString(),
      },
    };

    expect(pollNextMeasurementInMs(log as any, PREV_MEASUREMENT)).toEqual(
      30_000,
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith('Unexpected measurement age: NaN');
  });

  it('should return the minimum interval when `secondsAgo` is infinite', () => {
    const log = jest.fn();

    const PREV_MEASUREMENT = {
      time: {
        secondsAgo: Infinity,
        time: new Date().toISOString(),
      },
    };

    expect(pollNextMeasurementInMs(log as any, PREV_MEASUREMENT)).toEqual(
      30_000,
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith('Unexpected measurement age: Infinity');
  });

  it('should return the minimum interval when `secondsAgo` is negative', () => {
    const log = jest.fn();

    const PREV_MEASUREMENT = {
      time: {
        secondsAgo: -10,
        time: new Date().toISOString(),
      },
    };

    expect(pollNextMeasurementInMs(log as any, PREV_MEASUREMENT)).toEqual(
      30_000,
    );

    expect(log).toBeCalledTimes(1);
    expect(log).toBeCalledWith('Unexpected measurement age: -10');
  });

  it('should return 91 seconds for a fresh measurement', () => {
    const log = jest.fn();

    const PREV_MEASUREMENT = {
      time: {
        secondsAgo: 0,
        time: new Date().toISOString(),
      },
    };

    expect(pollNextMeasurementInMs(log as any, PREV_MEASUREMENT)).toEqual(
      91_000,
    );

    expect(log).toBeCalledTimes(0);
  });

  it('should return 46 seconds for a 45 second old measurement', () => {
    const log = jest.fn();

    const PREV_MEASUREMENT = {
      time: {
        secondsAgo: 45,
        time: new Date().toISOString(),
      },
    };

    expect(pollNextMeasurementInMs(log as any, PREV_MEASUREMENT)).toEqual(
      46_000,
    );

    expect(log).toBeCalledTimes(0);
  });

  it('should return 91 seconds for a 90 second old measurement', () => {
    const log = jest.fn();

    const PREV_MEASUREMENT = {
      time: {
        secondsAgo: 90,
        time: new Date().toISOString(),
      },
    };

    expect(pollNextMeasurementInMs(log as any, PREV_MEASUREMENT)).toEqual(
      91_000,
    );

    expect(log).toBeCalledTimes(0);
  });
});
