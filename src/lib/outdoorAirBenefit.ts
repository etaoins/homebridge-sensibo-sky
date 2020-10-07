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

interface Metric {
  roomMeasurement: number;
  target: number;
  bomObservation: number;
}

// Assume we can halve the outdoor humidity in dry mode
const effectiveOutdoorAirInDryMode = (humidity: number) => humidity / 2;

const metricIsBeneficial = (
  { roomMeasurement, target, bomObservation }: Metric,
  threshold: number,
): boolean =>
  (roomMeasurement - target > threshold &&
    roomMeasurement - bomObservation > threshold) ||
  (target - roomMeasurement > threshold &&
    bomObservation - roomMeasurement > threshold);

export const shouldStopIngesting = (
  { roomMeasurement, target, bomObservation }: OutdoorAirBenefitInput,
  mode: 'fan' | 'dry',
): boolean =>
  !metricIsBeneficial(
    {
      roomMeasurement: roomMeasurement.temperature,
      target: target.temperature,
      bomObservation: bomObservation.temperature,
    },
    0.0,
  ) ||
  !metricIsBeneficial(
    {
      roomMeasurement: roomMeasurement.humidity,
      target: target.humidity,
      bomObservation:
        mode === 'dry'
          ? effectiveOutdoorAirInDryMode(bomObservation.humidity)
          : bomObservation.humidity,
    },
    0.0,
  );

export const shouldStartIngesting = ({
  roomMeasurement,
  target,
  bomObservation,
}: OutdoorAirBenefitInput): 'fan' | 'dry' | false => {
  if (
    !metricIsBeneficial(
      {
        roomMeasurement: roomMeasurement.temperature,
        target: target.temperature,
        bomObservation: bomObservation.temperature,
      },
      1.0,
    )
  ) {
    // Temperature out-of-range; nothing we can do about this
    return false;
  }

  if (
    metricIsBeneficial(
      {
        roomMeasurement: roomMeasurement.humidity,
        target: target.humidity,
        bomObservation: bomObservation.humidity,
      },
      5.0,
    )
  ) {
    // We can just use the fan normally
    return 'fan';
  }

  if (
    roomMeasurement.temperature > target.temperature &&
    metricIsBeneficial(
      {
        roomMeasurement: roomMeasurement.humidity,
        target: target.humidity,
        bomObservation: effectiveOutdoorAirInDryMode(bomObservation.humidity),
      },
      5.0,
    )
  ) {
    // We can use dry mode to compensate for the outdoor humidity
    return 'dry';
  }

  return false;
};
