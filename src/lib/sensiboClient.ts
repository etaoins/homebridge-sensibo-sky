import https from 'https';

import { celciusToFahrenheit } from './temperature';
import { AcState } from './acState';
import { Device } from './device';
import { Measurement } from './measurement';

interface Request {
  body?: any;
  path: string;
  method: 'GET' | 'DELETE' | 'PUT' | 'POST';
}

interface StateChange {
  status: string;
  id: string;
  reason: string;
  acState: AcState;
  changedProperties: Array<keyof AcState>;
  failureReason: string | null;
}

const makeRequest = async (request: Request): Promise<any> =>
  new Promise((resolve, reject) => {
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
        try {
          resolve(JSON.parse(acc));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', () => {
      reject(new Error('HTTP error'));
    });

    // For POST (submit) state
    if (stringBody) {
      req.write(stringBody);
    }

    req.end();
  });

const post = async (request: Omit<Request, 'method'>): Promise<any> =>
  makeRequest({ ...request, method: 'POST' });

const get = async (path: string): Promise<any> =>
  makeRequest({ method: 'GET', path });

export class SensiboClient {
  constructor(readonly apiKey: string) {}

  async getPods(): Promise<Device[]> {
    const data = await get(
      `users/me/pods?fields=id,room&apiKey=${this.apiKey}`,
    );

    if (data?.status === 'success' && Array.isArray(data?.result)) {
      return data.result;
    }

    throw new Error(`Unexpected 'getPods' body with status ${data?.status}`);
  }

  async getState(deviceId: string): Promise<AcState | undefined> {
    // We get the last 10 items in case the first one failed.
    const data = await get(
      `pods/${deviceId}/acStates?fields=status,reason,acState&limit=10&apiKey=${this.apiKey}`,
    );

    if (!data) {
      throw new Error('Missing body');
    }

    const { status, result } = data;
    if (status === 'success' && Array.isArray(result)) {
      const stateChanges: StateChange[] = result;
      const firstSuccess = stateChanges.find(
        (entry) => entry.status === 'Success',
      );

      return firstSuccess?.acState;
    }

    throw new Error(`Unexpected 'getState' body with status ${data?.status}`);
  }

  async getMeasurements(deviceId: string): Promise<Measurement[]> {
    const data = await get(
      `pods/${deviceId}/measurements?fields=temperature,humidity,time&apiKey=${this.apiKey}`,
    );

    if (data?.status === 'success' && Array.isArray(data.result)) {
      return data.result;
    }

    throw new Error(
      `Unexpected 'getMeasurements' body with status ${data?.status}`,
    );
  }

  async submitState(deviceId: string, state: AcState): Promise<AcState> {
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

    const data = await post(request);

    const { status, result } = data;
    if (status === 'success' && typeof result === 'object') {
      const stateChange: StateChange = result;
      if (stateChange.status !== 'Success') {
        throw new Error(
          `'submitState' failed to change state with status ${status}: ${stateChange.failureReason}`,
        );
      }

      return stateChange.acState;
    }

    throw new Error(
      `Unexpected 'submitState' body with status ${data?.status}`,
    );
  }
}
