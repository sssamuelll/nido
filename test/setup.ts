// Global test setup for Vitest
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Clear all mocks after each test
afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

// Mock fetch globally for API tests
global.fetch = vi.fn();

// Mock console methods to keep test output clean
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Helper to reset environment variables
export const resetEnv = () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('JWT_SECRET', 'test-jwt-secret-minimum-32-characters-long');
  vi.stubEnv('DEFAULT_PASSWORD', 'test-password');
};

resetEnv();