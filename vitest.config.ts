import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Global test setup
    globals: true,
    environment: 'node', // default for backend tests
    environmentMatchGlobs: [
      // Use jsdom for React components in src/
      ['src/**', 'jsdom'],
    ],
    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/test-utils/**',
      ],
    },
    // Setup files
    setupFiles: ['./test/setup.ts'],
    // Mock server environment variables
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long',
      DEFAULT_PASSWORD: 'test-password',
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});