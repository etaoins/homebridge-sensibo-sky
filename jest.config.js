module.exports = {
  collectCoverageFrom: [
    'lib/autoMode.js',
    'lib/states.js',
    'lib/temperature.js',
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
