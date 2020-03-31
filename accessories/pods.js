const { inherits } = require('util');

const { calculateDesiredState } = require('../lib/autoMode');
const { statesEquivalent } = require('../lib/states');
const {
  SENSIBO_TEMPERATURE_RANGE,
  TARGET_TEMPERATURE_RANGE,
  clampTemperature,
  fahrenheitToCelsius,
} = require('../lib/temperature');

let Accessory;
let Service;
let Characteristic;
let uuid;
const stateTimeout = 30000; // in ms to min time elapse to call for refresh
const tempTimeout = 10000; // in ms to min time elapse before next call for refresh

// Pod Accessory
module.exports = function (oAccessory, oService, oCharacteristic, ouuid) {
  if (oAccessory) {
    Accessory = oAccessory;
    Service = oService;
    Characteristic = oCharacteristic;
    uuid = ouuid;

    inherits(SensiboPodAccessory, Accessory);
    SensiboPodAccessory.prototype.deviceGroup = 'pods';
    SensiboPodAccessory.prototype.loadData = loadData;
    SensiboPodAccessory.prototype.getServices = getServices;
    SensiboPodAccessory.prototype.refreshState = refreshState;
    SensiboPodAccessory.prototype.refreshTemperature = refreshTemperature;
    SensiboPodAccessory.prototype.identify = identify;
  }
  return SensiboPodAccessory;
};
module.exports.SensiboPodAccessory = SensiboPodAccessory;

function SensiboPodAccessory(platform, device) {
  this.deviceid = device.id;
  this.name = device.room.name;
  this.platform = platform;
  this.log = platform.log;
  this.debug = platform.debug;

  const idKey = `hbdev:sensibo:pod:${this.deviceid}`;
  const id = uuid.generate(idKey);

  Accessory.call(this, this.name, id);
  const that = this;

  // HomeKit does really strange things since we have to wait on the data to get populated
  // This is just intro information. It will be corrected in a couple of seconds.
  that.acState = {
    temperatureUnit: device.temperatureUnit, // "C" or "F"
    targetTemperature: undefined,
    on: false, // true or false
    mode: 'cool', // "heat", "cool", "fan" or "off"
    fanLevel: 'auto', // "auto", "high", "medium" or "low"
  };

  that.temp = {
    temperature: 20, // float
    humidity: 0, // int
  };

  that.masterSwitch = true;
  that.autoMode = false;
  that.heatingThresholdTemperature = undefined;
  that.userTargetTemperature = undefined;
  that.coolingThresholdTemperature = undefined;

  // AccessoryInformation characteristic
  // Manufacturer characteristic
  this.getService(Service.AccessoryInformation).setCharacteristic(
    Characteristic.Manufacturer,
    'homebridge-sensibo-sky',
  );

  // Model characteristic
  this.getService(Service.AccessoryInformation).setCharacteristic(
    Characteristic.Model,
    'version 0.2.1',
  );

  // SerialNumber characteristic
  this.getService(Service.AccessoryInformation).setCharacteristic(
    Characteristic.SerialNumber,
    `Pod ID: ${that.deviceid}`,
  );

  // Master switch
  this.addService(Service.Switch, 'Split Unit', 'Power')
    .getCharacteristic(Characteristic.On)
    .on('set', (value, callback) => {
      if (value === that.masterSwitch) {
        callback();
        return;
      }

      if (value) {
        that.log('Turning master switch on');

        that.masterSwitch = true;
        updateDesiredState(that, that.autoMode ? {} : { on: true }, callback);
      } else {
        that.log('Turning master switch off');

        that.masterSwitch = false;
        updateDesiredState(that, { on: false }, callback);
      }
    });

  // Thermostat Service
  const thermostatService = this.addService(Service.Thermostat);

  // Current Temperature characteristic
  thermostatService
    .getCharacteristic(Characteristic.CurrentTemperature)
    .setProps({
      unit: Characteristic.Units.CELSIUS,
      minStep: 0.1,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });

  // Target Heating/Cooling Mode characteristic
  thermostatService
    .getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .on('set', (value, callback) => {
      switch (value) {
        case Characteristic.TargetHeatingCoolingState.COOL:
          that.log('Setting target heating mode to cool');

          that.autoMode = false;
          updateCharacteristicsForManualMode(that, that.acState);

          updateDesiredState(that, { on: true, mode: 'cool' }, callback);

          break;
        case Characteristic.TargetHeatingCoolingState.HEAT:
          that.log('Setting target heating mode to heat');

          that.autoMode = false;
          updateCharacteristicsForManualMode(that, that.acState);

          updateDesiredState(that, { on: true, mode: 'heat' }, callback);

          break;
        case Characteristic.TargetHeatingCoolingState.AUTO:
          that.log('Setting target heating mode to auto');

          that.autoMode = true;
          updateCharacteristicsForAutoMode(that, that.acState);

          updateDesiredState(that, {}, callback);

          break;

        case Characteristic.TargetHeatingCoolingState.OFF:
        default:
          that.log('Setting target heating mode to off');

          that.autoMode = false;
          updateCharacteristicsForManualMode(that, that.acState);

          updateDesiredState(that, { mode: 'fan' }, callback);

          break;
      }
    });

  const commonTemperatureProps = {
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.CELSIUS,
    perms: [
      Characteristic.Perms.READ,
      Characteristic.Perms.WRITE,
      Characteristic.Perms.NOTIFY,
    ],
  };

  // Target Temperature characteristic
  thermostatService
    .getCharacteristic(Characteristic.TargetTemperature)
    .setProps({ ...commonTemperatureProps, ...SENSIBO_TEMPERATURE_RANGE })
    .on('set', (value, callback) => {
      that.log(`Setting target temperature: ${value}`);
      that.userTargetTemperature = clampTemperature(
        value,
        SENSIBO_TEMPERATURE_RANGE,
      );

      updateDesiredState(that, {}, callback);
    });

  // Heating Threshold Temperature Characteristic
  thermostatService
    .getCharacteristic(Characteristic.HeatingThresholdTemperature)
    .setProps({ ...commonTemperatureProps, ...TARGET_TEMPERATURE_RANGE })
    .on('set', (value, callback) => {
      that.log(`Setting heating threshold: ${value}`);
      that.heatingThresholdTemperature = clampTemperature(
        value,
        TARGET_TEMPERATURE_RANGE,
      );

      updateDesiredState(that, {}, callback);
    });

  // Cooling Threshold Temperature Characteristic
  thermostatService
    .getCharacteristic(Characteristic.CoolingThresholdTemperature)
    .setProps({ ...commonTemperatureProps, ...TARGET_TEMPERATURE_RANGE })
    .on('set', (value, callback) => {
      that.log(`Setting cooling threshold: ${value}`);
      that.coolingThresholdTemperature = clampTemperature(
        value,
        TARGET_TEMPERATURE_RANGE,
      );

      updateDesiredState(that, {}, callback);
    });

  // Humidity sensor service
  this.addService(Service.HumiditySensor);

  this.loadData();
  setInterval(this.loadData.bind(this), 30000);
}

function refreshState(callback) {
  // This prevents this from running more often
  const that = this;
  const rightnow = new Date();

  if (
    that.acState.updatetime &&
    rightnow.getTime() - that.acState.updatetime.getTime() < stateTimeout
  ) {
    if (callback) {
      callback();
    }
    return;
  }
  if (!that.acState.updatetime) {
    that.acState.updatetime = rightnow;
  }

  // Update the state
  that.platform.api.getState(that.deviceid, (acState) => {
    if (acState) {
      applyServerState(that, acState);

      if (callback) {
        callback();
      }
    }
  });
}

function applyServerState(that, acState) {
  that.acState.temperatureUnit = acState.temperatureUnit;

  const newTargetTemperature =
    that.acState.temperatureUnit === 'F'
      ? fahrenheitToCelsius(acState.targetTemperature)
      : acState.targetTemperature;

  if (that.acState.on !== acState.on) {
    if (acState.on) {
      that.log('Externally turned on');
      that.acState.on = true;
    } else {
      that.log('Externally turned off');
      that.acState.on = false;
    }
  }

  if (that.acState.targetTemperature !== newTargetTemperature) {
    if (acState.on) {
      that.log(
        'Target temperature externally changed from %s to %s',
        that.acState.targetTemperature,
        newTargetTemperature,
      );
    }

    that.acState.targetTemperature = newTargetTemperature;
  }

  if (that.acState.mode !== acState.mode) {
    if (acState.on) {
      that.log(
        'Mode externally changed from %s to %s',
        that.acState.mode,
        acState.mode,
      );
    }

    that.acState.mode = acState.mode;
  }

  that.acState.fanLevel = acState.fanLevel;
  that.acState.updatetime = new Date(); // Set our last update time.

  if (!that.autoMode) {
    that.userTargetTemperature = that.acState.targetTemperature;
  }

  updateCharacteristicsFromAcState(that, acState);
}

function heatingCoolingStateForAcState(acState, characteristic) {
  if (acState.on === false) {
    return characteristic.OFF;
  }

  switch (acState.mode) {
    case 'cool':
      return characteristic.COOL;
    case 'heat':
      return characteristic.HEAT;
    case 'fan':
    default:
      return characteristic.OFF;
  }
}

function updateCharacteristicsForAutoMode(that) {
  const masterSwitchService = that.getService(Service.Switch);
  masterSwitchService.updateCharacteristic(
    Characteristic.On,
    that.masterSwitch,
  );

  const thermostatService = that.getService(Service.Thermostat);

  thermostatService.updateCharacteristic(
    Characteristic.TargetHeatingCoolingState,
    Characteristic.TargetHeatingCoolingState.AUTO,
  );

  thermostatService.updateCharacteristic(
    Characteristic.TargetTemperature,
    that.userTargetTemperature,
  );
}

function updateCharacteristicsForManualMode(that, acState) {
  const masterSwitchService = that.getService(Service.Switch);
  masterSwitchService.updateCharacteristic(
    Characteristic.On,
    that.masterSwitch && acState.on,
  );

  const thermostatService = that.getService(Service.Thermostat);

  thermostatService.updateCharacteristic(
    Characteristic.TargetHeatingCoolingState,
    heatingCoolingStateForAcState(
      acState,
      Characteristic.TargetHeatingCoolingState,
    ),
  );

  thermostatService.updateCharacteristic(
    Characteristic.TargetTemperature,
    acState.targetTemperature,
  );
}

function updateCharacteristicsFromAcState(that, acState) {
  const thermostatService = that.getService(Service.Thermostat);

  // Current heating/cooling state
  thermostatService.updateCharacteristic(
    Characteristic.CurrentHeatingCoolingState,
    heatingCoolingStateForAcState(
      acState,
      Characteristic.CurrentHeatingCoolingState,
    ),
  );

  // Temperature Display Units characteristic
  thermostatService.updateCharacteristic(
    Characteristic.TemperatureDisplayUnits,
    acState.temperatureUnit === 'F'
      ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT
      : Characteristic.TemperatureDisplayUnits.CELSIUS,
  );

  if (that.autoMode) {
    updateCharacteristicsForAutoMode(that, acState);
  } else {
    updateCharacteristicsForManualMode(that, acState);
  }
}

function refreshTemperature(callback) {
  // This prevents this from running more often
  const that = this;
  const rightnow = new Date();

  if (
    that.temp.updatetime &&
    rightnow.getTime() - that.temp.updatetime.getTime() < tempTimeout
  ) {
    if (callback) {
      callback();
    }
    return;
  }
  if (!that.temp.updatetime) {
    that.acState.updatetime = rightnow;
  }

  // Update the temperature
  that.platform.api.getMeasurements(that.deviceid, (data) => {
    if (data && data.length > 0) {
      that.temp.temperature = data[0].temperature;
      that
        .getService(Service.Thermostat)
        .updateCharacteristic(
          Characteristic.CurrentTemperature,
          that.temp.temperature,
        );

      that.temp.humidity = data[0].humidity;
      that
        .getService(Service.HumiditySensor)
        .updateCharacteristic(
          Characteristic.CurrentRelativeHumidity,
          Math.round(that.temp.humidity),
        );

      that.temp.updatetime = new Date(); // Set our last update time.
    }
    if (callback) {
      callback();
    }
  });
}

function loadData(callback) {
  const that = this;
  this.refreshState(() =>
    that.refreshTemperature(() => updateDesiredState(that, {}, callback)),
  );
}

function getServices() {
  return this.services;
}

function identify() {
  this.log('Identify! (name: %s)', this.name);
}

function updateDesiredState(that, stateDelta, callback) {
  const {
    heatingThresholdTemperature,
    userTargetTemperature,
    coolingThresholdTemperature,
  } = that;

  let newState = {
    ...that.acState,
    ...stateDelta,
  };

  if (that.masterSwitch === false) {
    newState.on = false;
  } else if (
    that.autoMode &&
    typeof coolingThresholdTemperature === 'number' &&
    typeof heatingThresholdTemperature === 'number'
  ) {
    newState = calculateDesiredState(
      that.log.bind(that),
      {
        roomTemperature: that.temp.temperature,
        heatingThresholdTemperature,
        userTargetTemperature,
        coolingThresholdTemperature,
      },
      newState,
    );
  } else if (typeof userTargetTemperature === 'number') {
    newState.fanLevel = 'auto';
    newState.targetTemperature = userTargetTemperature;
  }

  if (statesEquivalent(that.acState, newState)) {
    if (callback) {
      callback();
    }
    return;
  }

  that.acState = newState;
  that.platform.api.submitState(that.deviceid, that.acState, (data) => {
    if (data && data.result && data.result.status === 'Success') {
      const { acState } = data.result;

      that.acState = acState;
      logStateChange(that);

      applyServerState(that, data.result.acState);
    } else {
      that.log('Error setting state');
    }

    if (callback) {
      callback();
    }
  });
}

function logStateChange(that) {
  if (that.acState.on) {
    that.log(
      'Changed status (roomTemp: %s, mode: %s, targetTemp: %s, speed: %s)',
      that.temp.temperature,
      that.acState.mode,
      that.acState.targetTemperature,
      that.acState.fanLevel,
    );
  } else {
    that.log('Changed status (roomTemp: %s, mode: off)', that.temp.temperature);
  }
}
