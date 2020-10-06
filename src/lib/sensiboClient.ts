import { OutgoingHttpHeaders } from 'http';
import https from 'https';

import { celciusToFahrenheit } from './temperature';
import { AcState } from './acState';
import { Device } from './device';
import { SensiboMeasurement } from './sensiboMeasurement';

/**
 * Interval that Sensibo collects measurements on
 */
export const MEASUREMENT_INTERVAL_SECS = 90;

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

const makeRequest = async (request: Request): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const options = {
      hostname: 'home.sensibo.com',
      port: 443,
      path: `/api/v2/${request.path}`,
      method: request.method,
      headers: { Accept: 'application/json' } as OutgoingHttpHeaders,
    };

    const stringBody = request.body ? JSON.stringify(request.body) : undefined;
    if (stringBody) {
      options.headers['Content-Length'] = Buffer.byteLength(stringBody);
      options.headers['Content-Type'] = 'application/json';
    }

    const req = https.request(options, (res) => {
      let acc = '';
      res.on('data', (chunk) => {
        acc += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(
            new Error(`Unexpected status code: ${String(res.statusCode)}`),
          );
        }

        try {
          resolve(JSON.parse(acc));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`HTTP request error: ${err.message}`));
    });

    // For POST (submit) state
    if (stringBody) {
      req.write(stringBody);
    }

    req.end();
  });

const post = async (request: Omit<Request, 'method'>): Promise<unknown> =>
  makeRequest({ ...request, method: 'POST' });

const get = async (path: string): Promise<unknown> =>
  makeRequest({ method: 'GET', path });

export class SensiboClient {
  constructor(readonly apiKey: string) {}

  async getPods(): Promise<Device[]> {
    const data = await get(
      `users/me/pods?fields=id,room&apiKey=${this.apiKey}`,
    );

    if (!data || typeof data !== 'object') {
      throw new Error("GET 'pods' body was not an object");
    }

    const { status, result } = data as Record<string, unknown>;
    if (status === 'success' && Array.isArray(result)) {
      return result as Device[];
    }

    throw new Error(`Unexpected GET 'pods' body with status ${String(status)}`);
  }

  async getAcState(deviceId: string): Promise<AcState | undefined> {
    // We get the last 10 items in case the first one failed.
    const data = await get(
      `pods/${deviceId}/acStates?fields=status,reason,acState&limit=10&apiKey=${this.apiKey}`,
    );

    if (!data || typeof data !== 'object') {
      throw new Error("GET 'acStates' body as not an object");
    }

    const { status, result } = data as Record<string, unknown>;
    if (status === 'success' && Array.isArray(result)) {
      const stateChanges = result as StateChange[];
      const firstSuccess = stateChanges.find(
        (entry) => entry.status === 'Success',
      );

      return firstSuccess?.acState;
    }

    throw new Error(
      `Unexpected GET 'acStates' body with status ${String(status)}`,
    );
  }

  async getMeasurements(deviceId: string): Promise<SensiboMeasurement[]> {
    const data = await get(
      `pods/${deviceId}/measurements?fields=temperature,humidity,time&apiKey=${this.apiKey}`,
    );

    if (!data || typeof data !== 'object') {
      throw new Error("GET 'measurements' body was not an object");
    }

    const { status, result } = data as Record<string, unknown>;
    if (status === 'success' && Array.isArray(result)) {
      return result as SensiboMeasurement[];
    }

    throw new Error(
      `Unexpected GET 'measurements' body with status ${String(status)}`,
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

    if (!data || typeof data !== 'object') {
      throw new Error("POST 'acStates' body as not an object");
    }

    const { status, result } = data as Record<string, unknown>;
    if (status === 'success' && typeof result === 'object') {
      const stateChange = result as StateChange;
      if (stateChange.status !== 'Success') {
        throw new Error(
          `POST 'acStates' failed to change state with status ${status}: ${String(
            stateChange.failureReason,
          )}`,
        );
      }

      return stateChange.acState;
    }

    throw new Error(
      `Unexpected POST 'acStates' body with status ${String(status)}`,
    );
  }
}
