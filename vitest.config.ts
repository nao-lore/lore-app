// NOTE: @testing-library/dom is not in devDependencies. 11 component tests
// that rely on @testing-library/react queries (getByRole, getByText, etc.)
// will fail until it is installed:  npm i -D @testing-library/dom
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'virtual:pwa-register': '/Users/nn/threadlog/src/__tests__/__mocks__/pwa-register.ts',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environmentMatchGlobs: [
      ['src/**/*.test.tsx', 'jsdom'],
    ],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:3000',
      },
    },
  },
});
