const { inherits } = require('util');

const { calculateDesiredState } = require('../lib/autoMode');
const { statesEquivalent } = require('../lib/states');
const {
  SENSIBO_TEMPERATURE_RANGE,
  TARGET_TEMPERATURE_RANGE,
  clampTemperature,
  convertToCelsius,
} = require('../lib/temperature');

let Accessory;
let Service;
let Characteristic;
let uuid;
const stateTimeout = 30000; // in ms to min time elapse to call for refresh
const tempTimeout = 10000; // in ms to min time elapse before next call for refresh
const stateRefreshRate = 30000; // Interval for status update

/*
 *   Pod Accessory
 */

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
    SensiboPodAccessory.prototype.refreshAll = refreshAll;
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
  this.state = {};
  this.temp = {};

  const idKey = `hbdev:sensibo:pod:${this.deviceid}`;
  const id = uuid.generate(idKey);

  Accessory.call(this, this.name, id);
  const that = this;

  // HomeKit does really strange things since we have to wait on the data to get populated
  // This is just intro information. It will be corrected in a couple of seconds.
  that.state.temperatureUnit = device.temperatureUnit; // "C" or "F"
  that.state.targetTemperature = undefined;
  that.state.on = false; // true or false
  that.state.mode = 'cool'; // "heat", "cool", "fan" or "off"
  that.state.fanLevel = 'auto'; // "auto", "high", "medium" or "low"
  that.state.hideHumidity = device.hideHumidity || false;
  that.state.refreshCycle = device.refreshCycle * 1000 || stateRefreshRate;
  that.temp.temperature = 20; // float
  that.temp.humidity = 0; // int

  that.masterSwitch = true;
  that.autoMode = false;
  that.heatingThresholdTemperature = undefined;
  that.userTargetTemperature = undefined;
  that.coolingThresholdTemperature = undefined;

  this.loadData();
  setInterval(this.loadData.bind(this), that.state.refreshCycle);

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
    .on('get', (callback) => {
      // Either in auto mode or manually on
      callback(null, that.masterSwitch && (that.state.on || that.autoMode));
    })
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

  // Current Heating/Cooling Mode characteristic
  thermostatService
    .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    .on('get', (callback) => {
      if (that.state.on === false) {
        callback(null, Characteristic.CurrentHeatingCoolingState.OFF);
      } else {
        switch (that.state.mode) {
          case 'cool':
            callback(null, Characteristic.CurrentHeatingCoolingState.COOL);
            break;
          case 'heat':
            callback(null, Characteristic.CurrentHeatingCoolingState.HEAT);
            break;
          case 'fan':
          default:
            callback(null, Characteristic.CurrentHeatingCoolingState.OFF);
            break;
        }
      }
    });

  // Target Heating/Cooling Mode characteristic
  thermostatService
    .getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .on('get', (callback) => {
      if (that.autoMode) {
        callback(null, Characteristic.CurrentHeatingCoolingState.AUTO);
      } else {
        switch (that.state.mode) {
          case 'cool':
            callback(null, Characteristic.TargetHeatingCoolingState.COOL);
            break;
          case 'heat':
            callback(null, Characteristic.TargetHeatingCoolingState.HEAT);
            break;
          default:
          case 'fan':
            callback(null, Characteristic.TargetHeatingCoolingState.OFF);
            break;
        }
      }
    })
    .on('set', (value, callback) => {
      switch (value) {
        case Characteristic.TargetHeatingCoolingState.COOL:
          that.log('Setting target heating mode to cool');
          that.autoMode = false;
          updateDesiredState(that, { on: true, mode: 'cool' }, callback);

          break;
        case Characteristic.TargetHeatingCoolingState.HEAT:
          that.log('Setting target heating mode to heat');
          that.autoMode = false;
          updateDesiredState(that, { on: true, mode: 'heat' }, callback);

          break;
        case Characteristic.TargetHeatingCoolingState.AUTO:
          that.log('Setting target heating mode to auto');
          that.autoMode = true;
          updateDesiredState(that, {}, callback);

          break;

        case Characteristic.TargetHeatingCoolingState.OFF:
        default:
          that.log('Setting target heating mode to off');
          that.autoMode = false;
          updateDesiredState(that, { mode: 'fan' }, callback);

          break;
      }
    });

  // Current Temperature characteristic
  thermostatService
    .getCharacteristic(Characteristic.CurrentTemperature)
    .on('get', (callback) => {
      callback(null, that.temp.temperature);
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
    .on('get', (callback) => {
      callback(null, that.state.targetTemperature);
    })

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
    .on('get', (callback) => {
      callback(null, that.heatingThresholdTemperature);
    })
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
    .on('get', (callback) => {
      callback(null, that.coolingThresholdTemperature);
    })
    .on('set', (value, callback) => {
      that.log(`Setting cooling threshold: ${value}`);
      that.coolingThresholdTemperature = clampTemperature(
        value,
        TARGET_TEMPERATURE_RANGE,
      );

      updateDesiredState(that, {}, callback);
    });

  // Temperature Display Units characteristic
  thermostatService
    .getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .on('get', (callback) => {
      if (that.state.temperatureUnit === 'F') {
        callback(null, Characteristic.TemperatureDisplayUnits.FAHRENHEIT);
      } else {
        callback(null, Characteristic.TemperatureDisplayUnits.CELSIUS);
      }
    });

  // Relative Humidity Service
  // Current Relative Humidity characteristic
  if (that.state.hideHumidity) {
    thermostatService
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .on('get', (callback) => {
        callback(null, Math.round(that.temp.humidity)); // int value
      });
  } else {
    this.addService(Service.HumiditySensor)
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .on('get', (callback) => {
        callback(null, Math.round(that.temp.humidity)); // int value
      });
  }
}

function refreshState(callback) {
  // This prevents this from running more often
  const that = this;
  const rightnow = new Date();

  if (
    that.state.updatetime &&
    rightnow.getTime() - that.state.updatetime.getTime() < stateTimeout
  ) {
    if (callback !== undefined) {
      callback();
    }
    return;
  }
  if (!that.state.updatetime) {
    that.state.updatetime = rightnow;
  }

  // Update the state
  that.platform.api.getState(that.deviceid, (acState) => {
    if (acState !== undefined) {
      that.state.temperatureUnit = acState.temperatureUnit;

      const newTargetTemperature =
        that.state.temperatureUnit === 'F'
          ? convertToCelsius(acState.targetTemperature)
          : acState.targetTemperature;

      if (that.state.on !== acState.on) {
        if (acState.on) {
          that.log('Externally turned on');
          that.state.on = true;
        } else {
          that.log('Externally turned off');
          that.state.on = false;
        }
      }

      if (that.state.targetTemperature !== newTargetTemperature) {
        if (acState.on) {
          that.log(
            'Target temperature externally changed from %s to %s',
            that.state.targetTemperature,
            newTargetTemperature,
          );
        }

        that.state.targetTemperature = newTargetTemperature;
      }

      if (that.state.mode !== acState.mode) {
        if (acState.on) {
          that.log(
            'Mode externally changed from %s to %s',
            that.state.mode,
            acState.mode,
          );
        }

        that.state.mode = acState.mode;
      }

      that.state.fanLevel = acState.fanLevel;
      that.state.updatetime = new Date(); // Set our last update time.

      if (that.autoMode) {
        updateDesiredState(that, {});
      } else {
        that.userTargetTemperature = that.state.targetTemperature;
      }
    }

    callback();
  });
}

function refreshTemperature(callback) {
  // This prevents this from running more often
  const that = this;
  const rightnow = new Date();

  if (
    that.temp.updatetime &&
    rightnow.getTime() - that.temp.updatetime.getTime() < tempTimeout
  ) {
    if (callback !== undefined) {
      callback();
    }
    return;
  }
  if (!that.temp.updatetime) {
    that.state.updatetime = rightnow;
  }

  // Update the temperature
  let data;
  that.platform.api.getMeasurements(that.deviceid, (myData) => {
    data = myData;
    if (data !== undefined) {
      that.temp.temperature = data[0].temperature;
      that.temp.humidity = data[0].humidity;
      that.temp.updatetime = new Date(); // Set our last update time.
    }
    if (callback) {
      callback();
    }
  });
}

function refreshAll(callback) {
  const that = this;
  // console.log("[%s: Refreshing all for %s]",(new Date()),that.name);
  this.refreshState(() => {
    that.refreshTemperature(callback);
  });
}

function loadData() {
  const that = this;
  this.refreshAll(() => {
    // Refresh the status on home App
    for (let i = 0; i < that.services.length; i++) {
      for (let j = 0; j < that.services[i].characteristics.length; j++) {
        that.services[i].characteristics[j].getValue();
      }
    }
  });
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
    ...that.state,
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

  if (statesEquivalent(that.state, newState)) {
    if (callback) {
      callback();
    }
    return;
  }

  that.state = newState;
  that.platform.api.submitState(that.deviceid, that.state, (data) => {
    if (data !== undefined) {
      logStateChange(that);
    }

    if (callback) {
      callback();
    }
  });
}

function logStateChange(that) {
  that.log(
    'Changed status (roomTemp: %s, mode: %s, targetTemp: %s, speed: %s)',
    that.temp.temperature,
    that.state.on ? that.state.mode : 'off',
    that.state.targetTemperature,
    that.state.fanLevel,
  );
}
