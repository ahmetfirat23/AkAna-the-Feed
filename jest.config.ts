import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'app/api/**/*.ts',
    'components/**/*.tsx',
    'hooks/**/*.ts',
    '!**/*.d.ts',
  ],
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
  // Some transitive dependencies of jsdom ship pure ESM. Allow ts-jest/babel
  // to transform them by NOT ignoring them in node_modules.
  transformIgnorePatterns: [
    '/node_modules/(?!(@exodus/bytes|encoding-lite|html-encoding-sniffer)/)',
  ],
};

export default createJestConfig(config);
