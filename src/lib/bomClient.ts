import http from 'http';
import { Measurement } from './measurement';

const MINUTE_IN_MILLISECONDS = 60 * 1000;
const HALF_HOUR_IN_MILLISECONDS = 30 * MINUTE_IN_MILLISECONDS;

interface Observation {
  air_temp: string;
  rel_hum: string;
}

interface Observations {
  observations: {
    data: Observation[];
  };
}

export const makeRequest = (url: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const req = http.request(url, (response) => {
      let acc = '';
      response.on('data', (chunk) => {
        acc += chunk;
      });

      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(
            new Error(`Unexpected response status ${response.statusCode}`),
          );
        }

        try {
          resolve(JSON.parse(acc));
        } catch (e) {
          reject(new Error('Invalid JSON body'));
          return;
        }
      });
    });

    req.on('error', () => {
      reject(new Error('HTTP error'));
    });

    req.end();
  });

export const intervalUntilNextObservation = (
  now: Date = new Date(),
): number => {
  const epochTime = now.getTime();

  // Round up to the nearest half hour
  const nextHalfHour =
    Math.ceil(epochTime / HALF_HOUR_IN_MILLISECONDS) *
      HALF_HOUR_IN_MILLISECONDS -
    epochTime;

  // Add 4-6 minutes to allow the BOM to publish
  return Math.ceil(
    nextHalfHour +
      4 * MINUTE_IN_MILLISECONDS +
      2 * Math.random() * MINUTE_IN_MILLISECONDS,
  );
};

export const getOutdoorMeasurement = async (
  bomObservationsUrl: string,
): Promise<Measurement> => {
  const responseBody = await makeRequest(bomObservationsUrl);
  if (typeof responseBody !== 'object') {
    throw new Error('Unexpected body type');
  }

  const { observations } = responseBody as Observations;
  const mostRecentObservation = observations.data[0];
  if (!mostRecentObservation) {
    throw new Error('No observations found');
  }

  const measurement: Measurement = {
    temperature: Number(mostRecentObservation.air_temp),
    humidity: Number(mostRecentObservation.rel_hum),
  };

  return measurement;
};
