const http = require('https');

function _http(data, callback) {
  const options = {
    hostname: 'home.sensibo.com',
    port: 443,
    path: `/api/v2/${data.path}`,
    method: data.method,
    headers: {},
  };

  // console.log(options.path);
  if (data.data) {
    data.data = JSON.stringify(data.data);
    options.headers['Content-Length'] = Buffer.byteLength(data.data);
    options.headers['Content-Type'] = 'application/json';
  }

  let str = '';
  const req = http.request(options, function (response) {
    response.on('data', function (chunk) {
      str += chunk;
    });

    response.on('end', function () {
      try {
        str = JSON.parse(str);
      } catch (e) {
        str = undefined;
      }

      if (callback) {
        callback(str);
      }
    });
  });

  req.on('error', function () {
    // console.log("[%s Sensibo API Debug] Error at req: %s - %s\n", new Date(),e.code.trim(),data.path);
    // still need to response properly
    str = undefined;
    if (callback) {
      callback(str);
    }
  });

  // For POST (submit) state
  if (data.data) {
    req.write(data.data);
  }

  req.end();
}

function post(data, callback) {
  data.method = 'POST';
  _http(data, callback);
}

function get(data, callback) {
  data.method = 'GET';
  _http(data, callback);
}

const sensibo = {
  init(inKey) {
    this.apiKey = inKey;
  },

  getPods(log, callback) {
    get(
      { path: `users/me/pods?fields=id,room&apiKey=${this.apiKey}` },
      function (data) {
        if (
          data &&
          data.status &&
          data.status === 'success' &&
          data.result &&
          data.result instanceof Array
        ) {
          callback(data.result);
        } else {
          callback();
        }
      },
    );
  },

  getState(deviceID, callback) {
    // We get the last 10 items in case the first one failed.
    get(
      {
        path: `pods/${deviceID}/acStates?fields=status,reason,acState&limit=10&apiKey=${this.apiKey}`,
      },
      function (data) {
        if (
          data &&
          data.status &&
          data.status === 'success' &&
          data.result &&
          data.result instanceof Array
        ) {
          let i = 0;
          for (i = 0; i < data.result.length; i++) {
            if (data.result[i].status === 'Success') {
              break;
            }
          }
          if (i === data.result.length) {
            i = 0;
          }
          callback(data.result[i].acState);
        } else {
          callback();
        }
      },
    );
  },

  getMeasurements(deviceID, callback) {
    get(
      {
        path: `pods/${deviceID}/measurements?fields=temperature,humidity,time&apiKey=${this.apiKey}`,
      },
      function (data) {
        if (
          data &&
          data.status &&
          data.status === 'success' &&
          data.result &&
          data.result instanceof Array
        ) {
          callback(data.result);
        } else {
          callback();
        }
      },
    );
  },

  submitState(deviceID, state, callback) {
    const data = {};
    data.data = {
      acState: {
        on: state.on,
        mode: state.mode,
        fanLevel: state.fanLevel,
        targetTemperature:
          state.temperatureUnit === 'F'
            ? convertToFahrenheit(state.targetTemperature)
            : state.targetTemperature,
        temperatureUnit: state.temperatureUnit,
      },
    };
    data.path = `pods/${deviceID}/acStates?apiKey=${this.apiKey}`;
    data.apiKey = this.apiKey;
    post(data, callback);
  },
};

function convertToFahrenheit(value) {
  return Math.round(value * 1.8 + 32);
}

module.exports = sensibo;
