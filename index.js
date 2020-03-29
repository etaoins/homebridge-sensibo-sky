var sensibo = require('./lib/sensiboapi');
var Service, Characteristic, Accessory, uuid;
var SensiboPodAccessory;

const timeRefresh = 30000; // refresh state cycle time in ms

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Accessory = homebridge.hap.Accessory;
  uuid = homebridge.hap.uuid;

  SensiboPodAccessory = require('./accessories/pods')(
    Accessory,
    Service,
    Characteristic,
    uuid,
  );

  homebridge.registerPlatform(
    'homebridge-sensibo-sky',
    'SensiboSky',
    SensiboPlatform,
  );
};

function SensiboPlatform(log, config) {
  // Load Wink Authentication From Config File
  this.apiKey = config['apiKey'];
  this.apiDebug = config['apiDebug'];
  this.timeLapse = config['timeLapse'];
  this.hideHumidity = config['hideHumidity'] || false;
  this.temperatureUnit = config['temperatureUnit'];
  this.defaultTemp = config['defaultTemp'];
  this.api = sensibo;
  this.log = log;
  this.debug = log.debug;
  this.deviceLookup = {};
}

SensiboPlatform.prototype = {
  reloadData: function (callback) {
    //This is called when we need to refresh all Wink device information.
    this.debug('Refreshing Sensibo Data');
    for (var i = 0; i < this.deviceLookup.length; i++) {
      this.deviceLookup[i].loadData();
    }
  },
  accessories: function (callback) {
    this.log('Fetching Sensibo devices...');

    var that = this;
    var foundAccessories = [];
    this.deviceLookup = [];

    /*
		var refreshLoop = function () {
			setInterval(that.reloadData.bind(that), timeRefresh);
		};
		*/
    sensibo.init(this.apiKey, this.debug);
    sensibo.getPods(that.log, function (devices) {
      // success
      var podTimeLapse = 0;

      if (devices != null) {
        for (var i = 0; i < devices.length; i++) {
          var device = devices[i];

          var accessory = undefined;

          device.refreshCycle = that.timeLapse + podTimeLapse;
          device.hideHumidity = that.hideHumidity || false;
          device.temperatureUnit = that.temperatureUnit;
          device.defaultTemp = that.defaultTemp;

          podTimeLapse += 0.5;
          accessory = new SensiboPodAccessory(that, device);

          if (accessory != undefined) {
            that.log(
              'Device Added (Name: %s, ID: %s, Group: %s)',
              accessory.name,
              accessory.deviceid,
              accessory.deviceGroup,
            );
            that.deviceLookup.push(accessory);
            foundAccessories.push(accessory);
          }
        }
        callback(foundAccessories);
      } else {
        that.log(
          'No senisbo devices return from Sensibo server ! Please check your APIkey.',
        );
      }
      //refreshLoop();
    });
  },
};
