import https from 'https';

import { celciusToFahrenheit } from './temperature';
import { AcState } from './acState';
import { Device } from './device';

interface Request {
  body?: any;
  path: string;
  method: 'GET' | 'DELETE' | 'PUT' | 'POST';
}

function makeRequest(request: Request, callback: (data?: any) => void) {
  const options = {
    hostname: 'home.sensibo.com',
    port: 443,
    path: `/api/v2/${request.path}`,
    method: request.method,
    headers: {} as Record<string, any>,
  };

  const stringBody = request.body ? JSON.stringify(request.body) : undefined;
  if (stringBody) {
    options.headers['Content-Length'] = Buffer.byteLength(stringBody);
    options.headers['Content-Type'] = 'application/json';
  }

  const req = https.request(options, (response) => {
    let acc = '';
    response.on('data', (chunk) => {
      acc += chunk;
    });

    response.on('end', () => {
      let parsedBody;
      try {
        parsedBody = JSON.parse(acc);
      } catch (e) {
        callback();
        return;
      }

      callback(parsedBody);
    });
  });

  req.on('error', () => {
    callback();
  });

  // For POST (submit) state
  if (stringBody) {
    req.write(stringBody);
  }

  req.end();
}

function post(request: Omit<Request, 'method'>, callback: (data: any) => void) {
  makeRequest({ ...request, method: 'POST' }, callback);
}

function get(path: string, callback: (data: any) => void) {
  makeRequest({ method: 'GET', path }, callback);
}

export class SensiboClient {
  constructor(readonly apiKey: string) {}

  getPods(callback: (devices?: Device[]) => void) {
    get(`users/me/pods?fields=id,room&apiKey=${this.apiKey}`, (data) => {
      if (data?.status === 'success' && Array.isArray(data?.result)) {
        callback(data.result);
      } else {
        callback(undefined);
      }
    });
  }

  getState(deviceId: string, callback: (acState?: AcState) => void) {
    // We get the last 10 items in case the first one failed.
    get(
      `pods/${deviceId}/acStates?fields=status,reason,acState&limit=10&apiKey=${this.apiKey}`,
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

  getMeasurements(deviceId: string, callback: (data?: any[]) => void) {
    get(
      `pods/${deviceId}/measurements?fields=temperature,humidity,time&apiKey=${this.apiKey}`,
      (data) => {
        if (data?.status === 'success' && Array.isArray(data.result)) {
          callback(data.result);
        } else {
          callback();
        }
      },
    );
  }

  submitState(deviceId: string, state: AcState, callback: (data: any) => void) {
    const request = {
      body: {
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
      path: `pods/${deviceId}/acStates?apiKey=${this.apiKey}`,
      apiKey: this.apiKey,
    };

    post(request, callback);
  }
}
