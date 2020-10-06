import { pollNextObservationInMs } from './bomObservation';

const MINUTE_IN_MILLISECONDS = 60 * 1000;

describe('pollNextObservationInMs', () => {
  it('rounds up to the next half hour', () => {
    const interval = pollNextObservationInMs(new Date('2020-01-01T05:15:00Z'));

    // This should be between 19 and 21 minutes in the future
    expect(interval).toBeGreaterThanOrEqual(19 * MINUTE_IN_MILLISECONDS);
    expect(interval).toBeLessThanOrEqual(21 * MINUTE_IN_MILLISECONDS);
  });

  it('waits until the next observation if within the window', () => {
    const interval = pollNextObservationInMs(new Date('2020-01-01T14:30:01Z'));

    // This should be between 34 and 36 minutes in the future
    expect(interval).toBeGreaterThanOrEqual(34 * MINUTE_IN_MILLISECONDS - 1000);
    expect(interval).toBeLessThanOrEqual(36 * MINUTE_IN_MILLISECONDS - 1000);
  });

  it('produces a sane value for the current time', () => {
    const interval = pollNextObservationInMs();
    expect(interval).toBeLessThanOrEqual(36 * MINUTE_IN_MILLISECONDS);
  });
});
