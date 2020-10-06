import http from 'http';
import { BomObservation } from './bomObservation';

interface ObservationRow {
  air_temp: string;
  rel_hum: string;
}

interface ObservationResponse {
  observations: {
    data: ObservationRow[];
  };
}

const makeRequest = (url: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { headers: { 'User-Agent': 'homebridge-sensibo-sky/0.4' } },
      (res) => {
        let acc = '';
        res.on('data', (chunk) => {
          acc += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(
              new Error(`Unexpected response status ${String(res.statusCode)}`),
            );
          }

          try {
            resolve(JSON.parse(acc));
          } catch (e) {
            reject(new Error('Invalid JSON body'));
            return;
          }
        });
      },
    );

    req.on('error', () => {
      reject(new Error('HTTP error'));
    });

    req.end();
  });

export const getBomObservation = async (
  bomObservationsUrl: string,
): Promise<BomObservation> => {
  const responseBody = await makeRequest(bomObservationsUrl);
  if (typeof responseBody !== 'object') {
    throw new Error('Unexpected body type');
  }

  const { observations } = responseBody as ObservationResponse;
  const mostRecentObservation = observations.data[0];
  if (!mostRecentObservation) {
    throw new Error('No observations found');
  }

  return {
    temperature: Number(mostRecentObservation.air_temp),
    humidity: Number(mostRecentObservation.rel_hum),
  };
};
