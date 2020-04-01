import nock from 'nock';

import {
  intervalUntilNextObservation,
  getOutdoorMeasurement,
} from './bomClient';
import MELBOURNE_OLYMPIC_PARK_OBSERVATIONS from '../fixtures/bomObservations/melbourneOlympicPark.json';

const MINUTE_IN_MILLISECONDS = 60 * 1000;
const BOM_SERVER = 'http://www.bom.gov.au';
const BOM_OBSERVATION_URL = 'http://www.bom.gov.au/jest.json';

describe('intervalUntilNextObservation', () => {
  it('rounds up to the next half hour', () => {
    const interval = intervalUntilNextObservation(
      new Date('2020-01-01T05:15:00Z'),
    );

    // This should be between 19 and 21 minutes in the future
    expect(interval).toBeGreaterThanOrEqual(19 * MINUTE_IN_MILLISECONDS);
    expect(interval).toBeLessThanOrEqual(21 * MINUTE_IN_MILLISECONDS);
  });

  it('waits until the next observation if within the window', () => {
    const interval = intervalUntilNextObservation(
      new Date('2020-01-01T14:30:01Z'),
    );

    // This should be between 34 and 36 minutes in the future
    expect(interval).toBeGreaterThanOrEqual(34 * MINUTE_IN_MILLISECONDS - 1000);
    expect(interval).toBeLessThanOrEqual(36 * MINUTE_IN_MILLISECONDS - 1000);
  });

  it('produces a sane value for the current time', () => {
    const interval = intervalUntilNextObservation();
    expect(interval).toBeLessThanOrEqual(36 * MINUTE_IN_MILLISECONDS);
  });
});

describe('getOutdoorMeasurement', () => {
  it('parses a successful response', async () => {
    nock(BOM_SERVER)
      .get('/jest.json')
      .reply(200, MELBOURNE_OLYMPIC_PARK_OBSERVATIONS);

    await expect(
      getOutdoorMeasurement(BOM_OBSERVATION_URL),
    ).resolves.toMatchObject({
      temperature: 16.2,
      humidity: 100,
    });
  });

  it('rejects on server error', async () => {
    nock(BOM_SERVER).get('/jest.json').reply(500);

    await expect(getOutdoorMeasurement(BOM_OBSERVATION_URL)).rejects.toThrow(
      'Unexpected response status 500',
    );
  });

  it('rejects on an invalid JSON body', async () => {
    nock(BOM_SERVER).get('/jest.json').reply(200, '{');

    await expect(getOutdoorMeasurement(BOM_OBSERVATION_URL)).rejects.toThrow(
      'Invalid JSON body',
    );
  });
});
