const { inherits } = require('util');

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

  that.autoMode = false;
  that.heatingThresholdTemperature = undefined;
  that.userTargetTemperature = undefined;
  that.coolingThresholdTemperature = undefined;

  // End of initial information
  that.log(
    that.name,
    that.state.temperatureUnit,
    that.state.targetTemperature,
    that.coolingThresholdTemperature,
    ', RefreshCycle: ',
    that.state.refreshCycle,
  );

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

  // Thermostat Service
  // Current Heating/Cooling Mode characteristic
  this.addService(Service.Thermostat);

  this.getService(Service.Thermostat)
    .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    .on('get', (callback) => {
      if (that.autoMode) {
        callback(null, Characteristic.CurrentHeatingCoolingState.AUTO);
      } else if (!that.state.on) {
        callback(null, Characteristic.CurrentHeatingCoolingState.OFF);
      } else {
        switch (that.state.mode) {
          case 'cool': // HomeKit only accepts HEAT/COOL/OFF, so we have to determine if we are Heating, Cooling or OFF.
            callback(null, Characteristic.CurrentHeatingCoolingState.COOL);
            break;
          case 'heat':
            callback(null, Characteristic.CurrentHeatingCoolingState.HEAT);
            break;
          case 'fan':
            callback(null, Characteristic.CurrentHeatingCoolingState.COOL);
            break;
          default:
            // anything else then we'll report the thermostat as off.
            callback(null, Characteristic.CurrentHeatingCoolingState.OFF);
            break;
        }
      }
    });

  // Target Heating/Cooling Mode characteristic
  this.getService(Service.Thermostat)
    .getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .on('get', (callback) => {
      if (that.autoMode) {
        callback(null, Characteristic.TargetHeatingCoolingState.AUTO);
      } else if (that.state.on === false) {
        callback(null, Characteristic.TargetHeatingCoolingState.OFF);
      } else {
        switch (that.state.mode) {
          case 'cool': // HomeKit only accepts HEAT/COOL/OFF, so we have to determine if we are Heating, Cooling or OFF.
            callback(null, Characteristic.TargetHeatingCoolingState.COOL);
            break;
          case 'heat':
            callback(null, Characteristic.TargetHeatingCoolingState.HEAT);
            break;
          case 'fan':
            callback(null, Characteristic.TargetHeatingCoolingState.AUTO);
            break;
          default:
            // anything else then we'll report the thermostat as off.
            callback(null, Characteristic.TargetHeatingCoolingState.OFF);
            break;
        }
      }
    })
    .on('set', (value, callback) => {
      that.log(that.name, 'State change set:', value);

      switch (value) {
        case Characteristic.TargetHeatingCoolingState.COOL:
          that.autoMode = false;
          updateDesiredState(that, { on: true, mode: 'cool' }, callback);

          break;
        case Characteristic.TargetHeatingCoolingState.HEAT:
          that.autoMode = false;
          updateDesiredState(that, { on: true, mode: 'heat' }, callback);

          break;
        case Characteristic.TargetHeatingCoolingState.AUTO:
          that.autoMode = true;
          updateDesiredState(that, {}, callback);

          break;

        case Characteristic.TargetHeatingCoolingState.OFF:
        default:
          that.autoMode = false;
          updateDesiredState(that, { on: false }, callback);

          break;
      }
    });

  // Current Temperature characteristic
  this.getService(Service.Thermostat)
    .getCharacteristic(Characteristic.CurrentTemperature)
    .on('get', (callback) => {
      callback(null, that.temp.temperature);
    });

  const TEMPERATURE_PROPS = {
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.CELSIUS,
    maxValue: 30,
    minValue: 18,
    minStep: 1,
    perms: [
      Characteristic.Perms.READ,
      Characteristic.Perms.WRITE,
      Characteristic.Perms.NOTIFY,
    ],
  };

  // Target Temperature characteristic
  this.getService(Service.Thermostat)
    .getCharacteristic(Characteristic.TargetTemperature)
    .setProps(TEMPERATURE_PROPS)
    .on('get', (callback) => {
      callback(null, that.state.targetTemperature);
    })

    .on('set', (value, callback) => {
      that.log(that.name, ': Setting target temperature: ', value);
      that.userTargetTemperature = value;

      updateDesiredState(that, {}, callback);
    });

  // Heating Threshold Temperature Characteristic
  this.getService(Service.Thermostat)
    .getCharacteristic(Characteristic.HeatingThresholdTemperature)
    .setProps({ ...TEMPERATURE_PROPS, minStep: 0.5 })
    .on('get', (callback) => {
      callback(null, that.heatingThresholdTemperature);
    })
    .on('set', (value, callback) => {
      that.log(that.name, ': Setting heating threshold: ', value);
      that.heatingThresholdTemperature = clampTemperature(value);

      updateDesiredState(that, {}, callback);
    });

  // Cooling Threshold Temperature Characteristic
  this.getService(Service.Thermostat)
    .getCharacteristic(Characteristic.CoolingThresholdTemperature)
    .setProps({ ...TEMPERATURE_PROPS, minStep: 0.5 })
    .on('get', (callback) => {
      callback(null, that.coolingThresholdTemperature);
    })
    .on('set', (value, callback) => {
      that.log(that.name, ': Setting cooling threshold: ', value);
      that.coolingThresholdTemperature = clampTemperature(value);

      updateDesiredState(that, {}, callback);
    });

  // Temperature Display Units characteristic
  this.getService(Service.Thermostat)
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
    this.getService(Service.Thermostat)
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .on('get', (callback) => {
        callback(null, Math.round(that.temp.humidity)); // int value
      });
  } else {
    this.addService(Service.HumiditySensor);

    this.getService(Service.HumiditySensor)
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
      let externalChange = false;

      that.state.temperatureUnit = acState.temperatureUnit;

      const newTargetTemperature =
        that.state.temperatureUnit === 'F'
          ? convertToCelsius(acState.targetTemperature)
          : acState.targetTemperature;

      if (that.state.on !== acState.on) {
        if (acState.on) {
          that.log('Externally turned on');
          that.state.on = true;
          externalChange = true;
        } else {
          that.log('Externally turned off');
          that.state.on = false;
          // This can happen when we hit our target temperature; don't consider
          // this an external change
        }
      }

      if (that.state.targetTemperature !== newTargetTemperature) {
        if (acState.on) {
          that.log(
            'Target temperature externally changed from %s to %s',
            that.state.targetTemperature,
            newTargetTemperature,
          );

          externalChange = true;
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

          externalChange = true;
        }

        that.state.mode = acState.mode;
      }

      that.state.fanLevel = acState.fanLevel;
      that.state.updatetime = new Date(); // Set our last update time.

      if (externalChange && that.autoMode) {
        that.log('Detected external change; disengaging auto mode');

        that.autoMode = false;
        that.heatingThresholdTemperature = that.state.targetTemperature;
        that.coolingThresholdTemperature = that.state.targetTemperature;
      }

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

function convertToCelsius(value) {
  return (value - 32) / 1.8;
}

function clampTemperature(value) {
  if (value <= 18.0) {
    return 18.0;
  } else if (value >= 30.0) {
    return 30.0;
  }

  return value;
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

  that.log(
    'Calculating desired state: autoMode: %s, roomTemp: %s, heatingThreshold: %s, userTarget: %s, coolingThreshold: %s',
    that.autoMode,
    that.temp.temperature,
    heatingThresholdTemperature,
    userTargetTemperature,
    coolingThresholdTemperature,
  );

  const newState = {
    ...that.state,
    ...stateDelta,
  };

  if (that.autoMode) {
    const targetTemperature =
      typeof userTargetTemperature === 'number'
        ? userTargetTemperature
        : Math.round(
            (heatingThresholdTemperature + coolingThresholdTemperature) / 2,
          );

    if (
      typeof coolingThresholdTemperature === 'number' &&
      that.temp.temperature > coolingThresholdTemperature
    ) {
      // Hotter than cooling threshold
      newState.mode = 'cool';
      newState.targetTemperature = targetTemperature;
      newState.on = true;
    } else if (
      typeof heatingThresholdTemperature === 'number' &&
      that.temp.temperature < heatingThresholdTemperature
    ) {
      // Colder than heating threshold
      newState.mode = 'heat';
      newState.targetTemperature = targetTemperature;
      newState.on = true;
    }
  } else if (typeof userTargetTemperature === 'number') {
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

function statesEquivalent(left, right) {
  if (left.on === false && right.on === false) {
    // If both states are off the other values don't matter
    return true;
  }

  return (
    left.mode === right.mode &&
    left.targetTemperature === right.targetTemperature &&
    left.on === right.on
  );
}

function logStateChange(that) {
  that.log(
    'Changed status (name: %s, roomTemp: %s, on: %s, mode: %s, targetTemp: %s, speed: %s)',
    that.name,
    that.temp.temperature,
    that.state.on,
    that.state.mode,
    that.state.targetTemperature,
    that.state.fanLevel,
  );
}
