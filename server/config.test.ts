import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Configuration module', () => {
  const originalEnv = { ...process.env };
  const originalExit = process.exit;

  beforeEach(() => {
    vi.resetModules();
    // Restore original env before each test
    process.env = { ...originalEnv };
    // Mock process.exit to prevent test termination
    process.exit = vi.fn() as any;
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exit = originalExit;
  });

  const importConfig = async () => {
    const mod = await import('./config.js');
    return mod.config;
  };

  describe('JWT_SECRET validation', () => {
    it('should accept a valid JWT_SECRET (≥32 chars)', async () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      const config = await importConfig();
      expect(config.jwtSecret).toBe('a'.repeat(32));
    });

    it('should reject JWT_SECRET shorter than 32 chars', async () => {
      process.env.JWT_SECRET = 'short';
      await expect(importConfig()).rejects.toThrow(/JWT_SECRET must be at least 32 characters/);
    });

    it('should reject default example placeholder', async () => {
      process.env.JWT_SECRET = 'change-me-to-a-random-secret-minimum-32-chars';
      await expect(importConfig()).rejects.toThrow(/JWT_SECRET must be a strong, unique value/);
    });

    it('should reject hardcoded development secret', async () => {
      process.env.JWT_SECRET = 'nido-secret-key-2026';
      await expect(importConfig()).rejects.toThrow(/JWT_SECRET must be a strong, unique value/);
    });
  });

  describe('DEFAULT_PASSWORD validation', () => {
    it('should accept a valid DEFAULT_PASSWORD (≥8 chars)', async () => {
      process.env.DEFAULT_PASSWORD = 'password123';
      process.env.JWT_SECRET = 'a'.repeat(32);
      const config = await importConfig();
      expect(config.defaultPassword).toBe('password123');
    });

    it('should reject DEFAULT_PASSWORD shorter than 8 chars', async () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DEFAULT_PASSWORD = 'short';
      await expect(importConfig()).rejects.toThrow(/DEFAULT_PASSWORD must be at least 8 characters/);
    });

    it('should reject default example placeholder', async () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DEFAULT_PASSWORD = 'change-me-to-a-strong-password';
      await expect(importConfig()).rejects.toThrow(/DEFAULT_PASSWORD must be changed from the default example/);
    });

    it('should allow DEFAULT_PASSWORD to be undefined (optional)', async () => {
      delete process.env.DEFAULT_PASSWORD;
      process.env.JWT_SECRET = 'a'.repeat(32);
      const config = await importConfig();
      expect(config.defaultPassword).toBeUndefined();
    });
  });

  describe('magic link allowlist', () => {
    it('should normalize MAGIC_LINK_ALLOWED_EMAILS into a lowercase list', async () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.MAGIC_LINK_ALLOWED_EMAILS = ' Samuel@Example.com, maria@example.com ,';
      const config = await importConfig();
      expect(config.magicLinkAllowedEmails).toEqual(['samuel@example.com', 'maria@example.com']);
    });
  });

  describe('Environment detection', () => {
    it('should detect production environment', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(32);
      const config = await importConfig();
      expect(config.isProduction).toBe(true);
      expect(config.isDevelopment).toBe(false);
      expect(config.isTest).toBe(false);
    });

    it('should detect development environment (default)', async () => {
      delete process.env.NODE_ENV;
      process.env.JWT_SECRET = 'a'.repeat(32);
      const config = await importConfig();
      expect(config.isDevelopment).toBe(true);
      expect(config.isProduction).toBe(false);
    });

    it('should detect test environment', async () => {
      process.env.NODE_ENV = 'test';
      process.env.JWT_SECRET = 'a'.repeat(32);
      const config = await importConfig();
      expect(config.isTest).toBe(true);
    });
  });

  describe('validateSecurity()', () => {
    it('should warn about short JWT_SECRET in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(40); // 40 chars (less than 64)
      process.env.DEFAULT_PASSWORD = 'password123'; // valid length (≥8)
      const config = await importConfig();
      const result = config.validateSecurity();
      expect(result.valid).toBe(false);
      expect(result.warnings).toContain(
        'JWT_SECRET is less than 64 characters in production - consider using a longer secret'
      );
    });

    it('should warn about weak DEFAULT_PASSWORD in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.DEFAULT_PASSWORD = 'shortpass'; // 9 chars (≥8 but <12)
      const config = await importConfig();
      const result = config.validateSecurity();
      expect(result.valid).toBe(false);
      expect(result.warnings).toContain(
        'DEFAULT_PASSWORD is less than 12 characters in production - consider using stronger default'
      );
    });

    it('should be valid with strong settings', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.DEFAULT_PASSWORD = 'very-long-strong-password-123';
      process.env.ALLOWED_ORIGINS = 'https://nido.sdar.dev';
      const config = await importConfig();
      const result = config.validateSecurity();
      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });
  });
});