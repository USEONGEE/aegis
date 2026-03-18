/** @type {import('jest').Config} */
export default {
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        strict: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        esModuleInterop: true,
        skipLibCheck: true,
        allowJs: true,
        types: ['jest', 'node'],
        rootDir: undefined,
        outDir: undefined,
        declaration: false,
        declarationMap: false,
        sourceMap: false
      },
      diagnostics: false
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
};
