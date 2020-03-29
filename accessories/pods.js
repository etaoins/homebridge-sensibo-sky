var inherits = require('util').inherits;

var Accessory, Service, Characteristic, uuid;
const tempOffset = 1;
const stateTimeout = 30000; //in ms to min time elapse to call for refresh
const tempTimeout = 10000; //in ms to min time elapse before next call for refresh
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

  var idKey = 'hbdev:sensibo:pod:' + this.deviceid;
  var id = uuid.generate(idKey);

  Accessory.call(this, this.name, id);
  var that = this;

  // HomeKit does really strange things since we have to wait on the data to get populated
  // This is just intro information. It will be corrected in a couple of seconds.
  that.state.temperatureUnit = device.temperatureUnit; // "C" or "F"
  that.state.targetTemperature = device.defaultTemp;
  that.state.on = false; // true or false
  that.state.mode = 'cool'; // "heat", "cool", "fan" or "off"
  that.state.fanLevel = 'auto'; // "auto", "high", "medium" or "low"
  that.state.hideHumidity = device.hideHumidity || false;
  that.state.refreshCycle = device.refreshCycle * 1000 || stateRefreshRate;
  that.temp.temperature = 16; // float
  that.temp.humidity = 0; // int
  that.coolingThresholdTemperature = device.defaultTemp;
  // End of initial information
  that.log(
    that.name,
    that.state.temperatureUnit,
    that.state.targetTemperature,
    that.coolingThresholdTemperature,
    ', RefreshCycle: ',
    that.state.refreshCycle,
  );

  this.loadData.bind(this);
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
    'Pod ID: ' + that.deviceid,
  );

  // Thermostat Service
  // Current Heating/Cooling Mode characteristic

  this.addService(Service.Thermostat);

  this.getService(Service.Thermostat)
    .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    .on('get', function (callback) {
      if (!that.state.on) {
        // Convert state.on parameter to TargetHeatingCoolingState
        callback(null, Characteristic.TargetHeatingCoolingState.OFF);
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
    .on('get', function (callback) {
      //that.log(that.deviceid,":",(new Date()).getTime(),":GetTargetHeatingCoolingState: ", that.state);
      if (!that.state.on) {
        // Convert state.on parameter to TargetHeatingCoolingState
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
    .on('set', function (value, callback) {
      that.log(
        that.name,
        'State change set, current ACstate:',
        that.state.mode,
        ' new state:',
        value,
      );

      switch (value) {
        case Characteristic.TargetHeatingCoolingState.OFF:
          that.state.on = false;
          break;
        case Characteristic.TargetHeatingCoolingState.COOL:
          that.state.mode = 'cool';
          that.state.on = true;
          break;
        case Characteristic.TargetHeatingCoolingState.HEAT:
          that.state.mode = 'heat';
          that.state.on = true;
          break;
        case Characteristic.TargetHeatingCoolingState.AUTO:
          if (that.state.targetTemperature <= that.temp.temperature) {
            that.state.mode = 'cool';
          } else {
            that.state.mode = 'heat';
          }
          that.state.on = true;
          break;
        default:
          that.state.mode = 'cool';
          that.state.on = false;
          break;
      }

      that.log(
        that.name,
        ' - Submit state change: New state: ',
        that.state.mode,
        'On/Off Status:',
        that.state.on,
      );
      that.platform.api.submitState(that.deviceid, that.state, function (data) {
        if (data !== undefined) {
          logStateChange(that);
        }
      });
      callback();
    });

  // Current Temperature characteristic
  this.getService(Service.Thermostat)
    .getCharacteristic(Characteristic.CurrentTemperature)
    .on('get', function (callback) {
      callback(null, that.temp.temperature);
    });

  // Target Temperature characteristic
  this.getService(Service.Thermostat)
    .getCharacteristic(Characteristic.TargetTemperature)
    .setProps({
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
    })
    .on('get', function (callback) {
      callback(null, that.state.targetTemperature);
    })

    .on('set', function (value, callback) {
      // limit temperature to Sensibo standards
      if (value <= 18.0) value = 18.0;
      else if (value >= 30.0) value = 30.0;
      var newTargetTemp = value;

      that.coolingThresholdTemperature = Math.round(that.temp.temperature);

      if (value <= that.coolingThresholdTemperature) {
        that.state.mode = 'cool';
      } else if (value > that.coolingThresholdTemperature) {
        that.state.mode = 'heat';
      }
      break;

      that.state.on = true;

      that.log(
        '[DEBUG temp] ',
        that.name,
        ' Cur Target temp:',
        that.state.targetTemperature,
        ' new targetTemp: ',
        newTargetTemp,
      );

      if (that.state.targetTemperature !== newTargetTemp) {
        // only send if it had changed
        that.state.targetTemperature = newTargetTemp;
        that.log(
          that.name,
          ' Submit new target temperature: ',
          that.state.targetTemperature,
        );

        that.platform.api.submitState(that.deviceid, that.state, function (
          data,
        ) {
          if (data !== undefined) {
            logStateChange(that);
          }
        });
      }
      callback();
    });

  // Cooling Threshold Temperature Characteristic
  this.getService(Service.Thermostat)
    .getCharacteristic(Characteristic.CoolingThresholdTemperature)
    .on('get', function (callback) {
      callback(null, that.coolingThresholdTemperature);
    })
    .on('set', function (value, callback) {
      that.log(
        that.name,
        ': Setting cool threshold (name: ',
        that.name,
        ', threshold: ',
        value,
        ')',
      );
      that.coolingThresholdTemperature = value;

      that
        .getService(Service.Thermostat)
        .getCharacteristic(Characteristic.TargetTemperature)
        .setValue(that.state.targetTemperature, callback);
    });

  // Temperature Display Units characteristic
  this.getService(Service.Thermostat)
    .getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .on('get', function (callback) {
      if (that.state.temperatureUnit == 'F')
        callback(null, Characteristic.TemperatureDisplayUnits.FAHRENHEIT);
      else callback(null, Characteristic.TemperatureDisplayUnits.CELSIUS);
    });

  // Relative Humidity Service
  // Current Relative Humidity characteristic
  if (that.state.hideHumidity) {
    this.getService(Service.Thermostat)
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .on('get', function (callback) {
        callback(null, Math.round(that.temp.humidity)); // int value
      });
  } else {
    this.addService(Service.HumiditySensor);

    this.getService(Service.HumiditySensor)
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .on('get', function (callback) {
        callback(null, Math.round(that.temp.humidity)); // int value
      });
  }
}

function refreshState(callback) {
  // This prevents this from running more often
  var that = this;
  var rightnow = new Date();

  //that.log(that.deviceid,":refreshState - timelapse:",(that.state.updatetime) ?(rightnow.getTime() - that.state.updatetime.getTime()) : 0, " - State: ",that.state);

  if (
    that.state.updatetime &&
    rightnow.getTime() - that.state.updatetime.getTime() < stateTimeout
  ) {
    if (callback !== undefined) callback();
    return;
  }
  if (!that.state.updatetime) that.state.updatetime = rightnow;
  // Update the State
  that.platform.api.getState(that.deviceid, function (acState) {
    if (acState !== undefined) {
      //all internal logic is in celsius, so convert to celsius
      that.state.targetTemperature = acState.targetTemperature;
      that.state.temperatureUnit = acState.temperatureUnit;
      if (that.state.temperatureUnit == 'F') {
        that.state.targetTemperature = convertToCelsius(
          that.state.targetTemperature,
        );
      }
      that.state.on = acState.on;

      that.state.mode = acState.mode;
      that.state.fanLevel = acState.fanLevel;
      that.state.updatetime = new Date(); // Set our last update time.
    }

    callback();
  });
}

function refreshTemperature(callback) {
  // This prevents this from running more often
  var that = this;
  var rightnow = new Date();

  //that.log(that.deviceid,":refreshTemperature - timelapse:",(that.temp.updatetime)?(rightnow.getTime() - that.temp.updatetime.getTime()):0, " - Temp: ",that.temp);

  if (
    that.temp.updatetime &&
    rightnow.getTime() - that.temp.updatetime.getTime() < tempTimeout
  ) {
    if (callback !== undefined) callback();
    return;
  }
  if (!that.temp.updatetime) that.state.updatetime = rightnow;
  // Update the Temperature
  var data;
  that.platform.api.getMeasurements(that.deviceid, function (myData) {
    data = myData;
    if (data !== undefined) {
      that.temp.temperature = data[0].temperature * tempOffset;
      that.temp.humidity = data[0].humidity;
      that.temp.updatetime = new Date(); // Set our last update time.
    }
    if (callback) callback();
  });
}

function refreshAll(callback) {
  var that = this;
  //console.log("[%s: Refreshing all for %s]",(new Date()),that.name);
  this.refreshState(function () {
    that.refreshTemperature(callback);
  });
}

function convertToCelsius(value) {
  return (value - 32) / 1.8;
}

function loadData() {
  var that = this;
  this.refreshAll(function () {
    // Refresh the status on home App
    for (var i = 0; i < that.services.length; i++) {
      for (var j = 0; j < that.services[i].characteristics.length; j++) {
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
