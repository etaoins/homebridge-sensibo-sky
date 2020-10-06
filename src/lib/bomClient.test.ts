import nock from 'nock';

import { getBomObservation } from './bomClient';
import MELBOURNE_OLYMPIC_PARK_OBSERVATIONS from '../fixtures/bomObservations/melbourneOlympicPark.json';

const BOM_SERVER = 'http://www.bom.gov.au';
const BOM_OBSERVATION_URL = 'http://www.bom.gov.au/jest.json';

describe('getBomObservation', () => {
  it('parses a successful response', async () => {
    nock(BOM_SERVER)
      .get('/jest.json')
      .reply(200, MELBOURNE_OLYMPIC_PARK_OBSERVATIONS);

    await expect(getBomObservation(BOM_OBSERVATION_URL)).resolves.toMatchObject(
      {
        temperature: 11.7,
        humidity: 76,
      },
    );
  });

  it('rejects on server error', async () => {
    nock(BOM_SERVER).get('/jest.json').reply(500);

    await expect(getBomObservation(BOM_OBSERVATION_URL)).rejects.toThrow(
      'Unexpected response status 500',
    );
  });

  it('rejects on an invalid JSON body', async () => {
    nock(BOM_SERVER).get('/jest.json').reply(200, '{');

    await expect(getBomObservation(BOM_OBSERVATION_URL)).rejects.toThrow(
      'Invalid JSON body',
    );
  });
});
