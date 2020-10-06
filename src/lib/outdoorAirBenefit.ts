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

const metricIsBeneficial = (
  { roomMeasurement, target, bomObservation }: Metric,
  threshold: number,
): boolean =>
  (roomMeasurement - target > threshold &&
    roomMeasurement - bomObservation > threshold) ||
  (target - roomMeasurement > threshold &&
    bomObservation - roomMeasurement > threshold);

export const shouldStopFanMode = ({
  roomMeasurement,
  target,
  bomObservation,
}: OutdoorAirBenefitInput): boolean =>
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
      bomObservation: bomObservation.humidity,
    },
    0.0,
  );

export const shouldStartFanMode = ({
  roomMeasurement,
  target,
  bomObservation,
}: OutdoorAirBenefitInput): boolean =>
  metricIsBeneficial(
    {
      roomMeasurement: roomMeasurement.temperature,
      target: target.temperature,
      bomObservation: bomObservation.temperature,
    },
    1.0,
  ) &&
  metricIsBeneficial(
    {
      roomMeasurement: roomMeasurement.humidity,
      target: target.humidity,
      bomObservation: bomObservation.humidity,
    },
    5.0,
  );
