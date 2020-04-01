import http from 'https';

import { celciusToFahrenheit } from './temperature';
import { AcState } from './acState';
import { Device } from './device';

function _http(data: any, callback: (data: any) => void) {
  const options = {
    hostname: 'home.sensibo.com',
    port: 443,
    path: `/api/v2/${data.path}`,
    method: data.method,
    headers: {} as Record<string, any>,
  };

  // console.log(options.path);
  if (data.data) {
    data.data = JSON.stringify(data.data);
    options.headers['Content-Length'] = Buffer.byteLength(data.data);
    options.headers['Content-Type'] = 'application/json';
  }

  let str: string | undefined = '';
  const req = http.request(options, (response) => {
    response.on('data', (chunk) => {
      str += chunk;
    });

    response.on('end', () => {
      try {
        if (typeof str === 'string') {
          str = JSON.parse(str);
        }
      } catch (e) {
        str = undefined;
      }

      if (callback) {
        callback(str);
      }
    });
  });

  req.on('error', () => {
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

function post(data: any, callback: (data: any) => void) {
  data.method = 'POST';
  _http(data, callback);
}

function get(data: any, callback: (data: any) => void) {
  data.method = 'GET';
  _http(data, callback);
}

export class Sensibo {
  constructor(readonly apiKey: string) {}

  getPods(callback: (devices?: Device[]) => void) {
    get(
      { path: `users/me/pods?fields=id,room&apiKey=${this.apiKey}` },
      (data) => {
        if (data?.status === 'success' && Array.isArray(data?.result)) {
          callback(data.result);
        } else {
          callback(undefined);
        }
      },
    );
  }

  getState(deviceID: string, callback: (acState?: AcState) => void) {
    // We get the last 10 items in case the first one failed.
    get(
      {
        path: `pods/${deviceID}/acStates?fields=status,reason,acState&limit=10&apiKey=${this.apiKey}`,
      },
      (data) => {
        if (!data) {
          callback();
          return;
        }

        const { status, result } = data;
        if (status === 'success' && Array.isArray(result)) {
          const firstSuccess = result.find(
            (entry) => entry.status === 'Success',
          );

          callback(firstSuccess?.acState);
        } else {
          callback();
        }
      },
    );
  }

  getMeasurements(deviceID: string, callback: (data?: any[]) => void) {
    get(
      {
        path: `pods/${deviceID}/measurements?fields=temperature,humidity,time&apiKey=${this.apiKey}`,
      },
      (data) => {
        if (data?.status === 'success' && Array.isArray(data.result)) {
          callback(data.result);
        } else {
          callback();
        }
      },
    );
  }

  submitState(deviceID: string, state: AcState, callback: (data: any) => void) {
    const data = {
      data: {
        acState: {
          on: state.on,
          mode: state.mode,
          fanLevel: state.fanLevel,
          targetTemperature:
            state.temperatureUnit === 'F'
              ? celciusToFahrenheit(state.targetTemperature)
              : state.targetTemperature,
          temperatureUnit: state.temperatureUnit,
        },
      },
      path: `pods/${deviceID}/acStates?apiKey=${this.apiKey}`,
      apiKey: this.apiKey,
    };

    post(data, callback);
  }
}
