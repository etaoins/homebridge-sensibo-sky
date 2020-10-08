import { BomObservation } from './bomObservation';
import { SensiboMeasurement } from './sensiboMeasurement';

export interface OutdoorAirBenefitInput {
  roomMeasurement: Pick<SensiboMeasurement, 'temperature' | 'humidity'>;
  target: TargetAirState;
  bomObservation: BomObservation;
}

interface TargetAirState {
  humidity: number;
  temperature: number;
}

const metricIsBeneficial = (
  input: OutdoorAirBenefitInput,
  metricName: 'temperature' | 'humidity',
  mode: 'dry' | 'fan',
  threshold: number,
): boolean => {
  const roomMeasurement = input.roomMeasurement[metricName];
  const target = input.target[metricName];

  const ingestedAir =
    metricName === 'humidity' && mode === 'dry'
      ? // Assume we can halve the outdoor humidity in dry mode
        input.bomObservation.humidity / 2
      : input.bomObservation[metricName];

  return (
    (roomMeasurement - target > threshold &&
      roomMeasurement - ingestedAir > threshold) ||
    (target - roomMeasurement > threshold &&
      ingestedAir - roomMeasurement > threshold)
  );
};

export const shouldStopIngesting = (
  input: OutdoorAirBenefitInput,
  mode: 'fan' | 'dry',
): boolean => {
  if (
    !metricIsBeneficial(input, 'temperature', mode, 0.0) &&
    !metricIsBeneficial(input, 'humidity', mode, 0.0)
  ) {
    // Neither are a benefit; stop
    return true;
  }

  if (
    mode === 'dry' &&
    input.roomMeasurement.humidity <= input.target.humidity
  ) {
    // Don't keep drying past the target humidity; this is expensive madness
    return true;
  }

  // Keep going until one metric is out of range
  return (
    !metricIsBeneficial(input, 'temperature', mode, -1.0) ||
    !metricIsBeneficial(input, 'humidity', mode, -5.0)
  );
};

export const shouldStartIngesting = (
  input: OutdoorAirBenefitInput,
): 'fan' | 'dry' | false => {
  if (!metricIsBeneficial(input, 'temperature', 'fan', 1.0)) {
    // Temperature out-of-range; nothing we can do about this
    return false;
  }

  if (metricIsBeneficial(input, 'humidity', 'fan', 5.0)) {
    // We can just use the fan normally
    return 'fan';
  }

  if (
    // Make sure we're more hot & humid than desired before using dry mode
    input.roomMeasurement.temperature > input.target.temperature &&
    input.roomMeasurement.humidity > input.target.humidity &&
    input.roomMeasurement.humidity > 50 &&
    metricIsBeneficial(input, 'humidity', 'dry', 5.0)
  ) {
    // We can use dry mode to compensate for the outdoor humidity
    return 'dry';
  }

  return false;
};
