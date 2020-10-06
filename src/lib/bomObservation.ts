const MINUTE_IN_MILLISECONDS = 60 * 1000;
const HALF_HOUR_IN_MILLISECONDS = 30 * MINUTE_IN_MILLISECONDS;

export interface BomObservation {
  temperature: number;
  humidity: number;
}

export const pollNextObservationInMs = (now: Date = new Date()): number => {
  const epochTime = now.getTime();

  // Round up to the nearest half hour
  const nextHalfHour =
    Math.ceil(epochTime / HALF_HOUR_IN_MILLISECONDS) *
      HALF_HOUR_IN_MILLISECONDS -
    epochTime;

  // Add 4-6 minutes to allow the BOM to publish
  return Math.ceil(
    nextHalfHour +
      4 * MINUTE_IN_MILLISECONDS +
      2 * Math.random() * MINUTE_IN_MILLISECONDS,
  );
};
