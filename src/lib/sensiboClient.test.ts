import nock from 'nock';

import { SensiboClient } from './sensiboClient';

const nockScope = nock('https://home.sensibo.com');
const sensiboClient = new SensiboClient('TEST-API-KEY');

describe('sensiboClient', () => {
  describe('getPods', () => {
    it('should sucessfully return pods', async () => {
      nockScope
        .get('/api/v2/users/me/pods?fields=id,room&apiKey=TEST-API-KEY')
        .replyWithFile(
          200,
          './src/fixtures/sensiboClient/getPods.success.json',
        );

      await expect(sensiboClient.getPods()).resolves.toMatchInlineSnapshot(`
                      Array [
                        Object {
                          "id": "def456",
                          "room": Object {
                            "icon": "livingroom",
                            "name": "Living Room",
                          },
                        },
                      ]
                  `);

      expect(nockScope.isDone()).toBe(true);
    });

    it('should return an error on a request error', async () => {
      nockScope
        .get('/api/v2/users/me/pods?fields=id,room&apiKey=TEST-API-KEY')
        .replyWithError('Did not work!');

      await expect(sensiboClient.getPods()).rejects.toThrow(
        'HTTP request error: Did not work!',
      );

      expect(nockScope.isDone()).toBe(true);
    });
  });

  describe('getAcState', () => {
    it('should sucessfully return the most recent AC state', async () => {
      nockScope
        .get(
          '/api/v2/pods/def456/acStates?fields=status,reason,acState&limit=10&apiKey=TEST-API-KEY',
        )
        .replyWithFile(
          200,
          './src/fixtures/sensiboClient/getAcStates.success.json',
        );

      await expect(sensiboClient.getAcState('def456')).resolves
        .toMatchInlineSnapshot(`
                        Object {
                          "fanLevel": "low",
                          "mode": "heat",
                          "on": false,
                          "targetTemperature": 21,
                          "temperatureUnit": "C",
                        }
                    `);

      expect(nockScope.isDone()).toBe(true);
    });

    it('should return an error on missing device', async () => {
      nockScope
        .get(
          '/api/v2/pods/def456/acStates?fields=status,reason,acState&limit=10&apiKey=TEST-API-KEY',
        )
        .replyWithFile(
          404,
          './src/fixtures/sensiboClient/getAcStates.notfound.json',
        );

      await expect(sensiboClient.getAcState('def456')).rejects.toThrowError(
        'Unexpected status code: 404',
      );

      expect(nockScope.isDone()).toBe(true);
    });
  });

  describe('getMeasurements', () => {
    it('should sucessfully return measurements', async () => {
      nockScope
        .get(
          '/api/v2/pods/def456/measurements?fields=temperature,humidity,time&apiKey=TEST-API-KEY',
        )
        .replyWithFile(
          200,
          './src/fixtures/sensiboClient/getMeasurements.success.json',
        );

      await expect(sensiboClient.getMeasurements('def456')).resolves
        .toMatchInlineSnapshot(`
                          Array [
                            Object {
                              "humidity": 61.3,
                              "temperature": 19.7,
                              "time": Object {
                                "secondsAgo": 31,
                                "time": "2020-04-05T20:30:03.654119Z",
                              },
                            },
                          ]
                      `);

      expect(nockScope.isDone()).toBe(true);
    });

    it('should return an error on invalid JSON', async () => {
      nockScope
        .get(
          '/api/v2/pods/def456/measurements?fields=temperature,humidity,time&apiKey=TEST-API-KEY',
        )
        .reply(200, '{');

      await expect(sensiboClient.getMeasurements('def456')).rejects.toThrow(
        'Unexpected end of JSON input',
      );

      expect(nockScope.isDone()).toBe(true);
    });

    it('should return an error with a bad API key', async () => {
      nockScope
        .get(
          '/api/v2/pods/def456/measurements?fields=temperature,humidity,time&apiKey=TEST-API-KEY',
        )
        .replyWithFile(
          403,
          './src/fixtures/sensiboClient/getMeasurements.notauthorized.json',
        );

      await expect(sensiboClient.getMeasurements('def456')).rejects.toThrow(
        'Unexpected status code: 403',
      );

      expect(nockScope.isDone()).toBe(true);
    });
  });

  describe('submitState', () => {
    it('should sucessfully submit a new state', async () => {
      const MOCK_STATE = {
        on: true,
        targetTemperature: 21,
        temperatureUnit: 'C',
        fanLevel: 'medium',
        mode: 'heat',
      } as const;

      nockScope
        .post('/api/v2/pods/def456/acStates?apiKey=TEST-API-KEY', {
          acState: MOCK_STATE,
        })
        .replyWithFile(
          200,
          './src/fixtures/sensiboClient/submitState.success.json',
        );

      await expect(sensiboClient.submitState('def456', MOCK_STATE)).resolves
        .toMatchInlineSnapshot(`
              Object {
                "fanLevel": "low",
                "mode": "heat",
                "on": true,
                "targetTemperature": 24,
                "temperatureUnit": "C",
              }
            `);

      expect(nockScope.isDone()).toBe(true);
    });

    it('should return an error on an unsupported remote command', async () => {
      const MOCK_STATE = {
        on: true,
        targetTemperature: 24,
        temperatureUnit: 'C',
        mode: 'fan',
        fanLevel: 'low',
      };

      nockScope
        .post('/api/v2/pods/def456/acStates?apiKey=TEST-API-KEY', {
          acState: MOCK_STATE,
        })
        .replyWithFile(
          500,
          './src/fixtures/sensiboClient/submitState.nosuchremotecommand.json',
        );

      await expect(
        sensiboClient.submitState('def456', MOCK_STATE as any),
      ).rejects.toThrow('Unexpected status code: 500');

      expect(nockScope.isDone()).toBe(true);
    });
  });
});
