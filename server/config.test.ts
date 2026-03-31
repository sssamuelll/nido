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

  describe('Supabase config validation', () => {
    it('should require SUPABASE_URL', async () => {
      delete process.env.SUPABASE_URL;
      process.env.SUPABASE_ANON_KEY = 'some-key';
      await expect(importConfig()).rejects.toThrow(/SUPABASE_URL/);
    });

    it('should require SUPABASE_ANON_KEY', async () => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      delete process.env.SUPABASE_ANON_KEY;
      await expect(importConfig()).rejects.toThrow(/SUPABASE_ANON_KEY/);
    });

    it('should accept valid Supabase config', async () => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'some-key';
      const config = await importConfig();
      expect(config.supabaseUrl).toBe('https://example.supabase.co');
      expect(config.supabaseAnonKey).toBe('some-key');
    });
  });

  describe('magic link allowlist', () => {
    it('should normalize MAGIC_LINK_ALLOWED_EMAILS into a lowercase list', async () => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'some-key';
      process.env.MAGIC_LINK_ALLOWED_EMAILS = ' Samuel@Example.com, maria@example.com ,';
      const config = await importConfig();
      expect(config.magicLinkAllowedEmails).toEqual(['samuel@example.com', 'maria@example.com']);
    });
  });

  describe('Environment detection', () => {
    it('should detect production environment', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'some-key';
      const config = await importConfig();
      expect(config.isProduction).toBe(true);
      expect(config.isDevelopment).toBe(false);
      expect(config.isTest).toBe(false);
    });

    it('should detect development environment (default)', async () => {
      delete process.env.NODE_ENV;
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'some-key';
      const config = await importConfig();
      expect(config.isDevelopment).toBe(true);
      expect(config.isProduction).toBe(false);
    });

    it('should detect test environment', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'some-key';
      const config = await importConfig();
      expect(config.isTest).toBe(true);
    });
  });

  describe('validateSecurity()', () => {
    it('should warn about missing ALLOWED_ORIGINS in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'some-key';
      delete process.env.ALLOWED_ORIGINS;
      const config = await importConfig();
      const result = config.validateSecurity();
      expect(result.valid).toBe(false);
      expect(result.warnings).toContain(
        'ALLOWED_ORIGINS is not set - CORS will reject all cross-origin requests in production'
      );
    });

    it('should be valid with strong settings', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'some-key';
      process.env.ALLOWED_ORIGINS = 'https://nido.sdar.dev';
      const config = await importConfig();
      const result = config.validateSecurity();
      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });
  });
});
