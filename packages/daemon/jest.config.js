/** @type {import('jest').Config} */
export default {
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: { module: 'ESNext', moduleResolution: 'bundler' } }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@wdk-app/protocol$': '<rootDir>/../protocol/src/index.ts',
  },
}
