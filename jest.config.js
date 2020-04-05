module.exports = {
  preset: 'ts-jest',
  roots: ['<rootDir>/src'],
  collectCoverageFrom: [
    'src/lib/acState.ts',
    'src/lib/measurement.ts',
    'src/lib/temperature.ts',
    'src/lib/temperatureController.ts',
    'src/lib/userState.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};
