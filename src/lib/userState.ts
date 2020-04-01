export interface UserState {
  masterSwitch: boolean;
  autoMode: boolean;
  heatingThresholdTemperature?: number;
  targetTemperature?: number;
  coolingThresholdTemperature?: number;
}
