import * as Homebridge from 'homebridge';

/**
 * Minimum poll interval
 */
const MINIMUM_POLL_INTERVAL_SECS = 30;

/**
 * Interval that Sensibo collects measurements on
 */
const MEASUREMENT_INTERVAL_SECS = 90;

export interface Measurement {
  temperature: number;
  humidity: number;
  time: { secondsAgo: number; time: string };
}

/**
 * Calculates when we should poll for the next measurement
 */
export const pollNextMeasurementInMs = (
  log: Homebridge.Logging,
  prevMeasurement?: Pick<Measurement, 'time'>,
): number => {
  if (!prevMeasurement) {
    return MINIMUM_POLL_INTERVAL_SECS * 1000;
  }

  const { secondsAgo } = prevMeasurement.time;
  if (
    !Number.isFinite(secondsAgo) ||
    Number.isNaN(secondsAgo) ||
    secondsAgo < 0 ||
    secondsAgo > MEASUREMENT_INTERVAL_SECS
  ) {
    log(`Unexpected measurement age: ${secondsAgo}`);
    return MINIMUM_POLL_INTERVAL_SECS * 1000;
  }

  return (
    (MEASUREMENT_INTERVAL_SECS - (secondsAgo % MEASUREMENT_INTERVAL_SECS) + 1) *
    1000
  );
};
