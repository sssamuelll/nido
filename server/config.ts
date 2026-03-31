/**
 * Configuration module for Nido server.
 * Validates environment variables and provides typed config.
 */

import { z } from 'zod';

// Schema for environment variables
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3100'),

  // Database
  DATABASE_URL: z.string().optional(),

  // Auth – Supabase magic link (required)
  APP_BASE_URL: z.string().url().default('http://localhost:3100'),
  SUPABASE_URL: z.string().url('SUPABASE_URL is required for magic link auth'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required for magic link auth'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  MAGIC_LINK_ALLOWED_EMAILS: z.string().optional(),
  APP_SESSION_DAYS: z.string().regex(/^\d+$/).transform(Number).default('30'),
  APP_SESSION_COOKIE_NAME: z.string().min(1).default('nido_session'),

  // CORS – required in production to prevent wildcard origin with credentials
  ALLOWED_ORIGINS: z.string().min(1).optional(),
});

// Type inference
export type EnvConfig = z.infer<typeof envSchema>;

class Config {
  private config: EnvConfig;

  constructor() {
    this.config = this.validate();
  }

  private validate(): EnvConfig {
    try {
      const rawEnv = {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        DATABASE_URL: process.env.DATABASE_URL,
        APP_BASE_URL: process.env.APP_BASE_URL,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        MAGIC_LINK_ALLOWED_EMAILS: process.env.MAGIC_LINK_ALLOWED_EMAILS,
        APP_SESSION_DAYS: process.env.APP_SESSION_DAYS,
        APP_SESSION_COOKIE_NAME: process.env.APP_SESSION_COOKIE_NAME,
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      };

      return envSchema.parse(rawEnv);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err =>
          `${err.path.join('.')}: ${err.message}`
        ).join('\n');

        console.error('❌ Environment configuration error:');
        console.error(errorMessages);
        console.error('\n💡 Please check your .env file or environment variables.');
        console.error('   For development, copy .env.example to .env and generate secure values.');
        console.error('   You can run: npm run setup-env');

        if (process.env.NODE_ENV === 'production') {
          process.exit(1);
        }

        throw new Error(`Configuration validation failed: ${errorMessages}`);
      }
      throw error;
    }
  }

  get isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  get isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  get isTest(): boolean {
    return this.config.NODE_ENV === 'test';
  }

  get port(): number {
    return this.config.PORT;
  }

  get databaseUrl(): string | undefined {
    return this.config.DATABASE_URL;
  }

  get appBaseUrl(): string {
    return this.config.APP_BASE_URL;
  }

  get supabaseUrl(): string {
    return this.config.SUPABASE_URL;
  }

  get supabaseAnonKey(): string {
    return this.config.SUPABASE_ANON_KEY;
  }

  get supabaseServiceRoleKey(): string | undefined {
    return this.config.SUPABASE_SERVICE_ROLE_KEY;
  }

  get magicLinkAllowedEmails(): string[] {
    return (this.config.MAGIC_LINK_ALLOWED_EMAILS ?? '')
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(Boolean);
  }

  get appSessionDays(): number {
    return this.config.APP_SESSION_DAYS;
  }

  get appSessionCookieName(): string {
    return this.config.APP_SESSION_COOKIE_NAME;
  }

  get allowedOrigins(): string[] | undefined {
    return this.config.ALLOWED_ORIGINS
      ? this.config.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
      : undefined;
  }

  validateSecurity(): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (this.isProduction) {
      if (!this.config.ALLOWED_ORIGINS) {
        warnings.push('ALLOWED_ORIGINS is not set - CORS will reject all cross-origin requests in production');
      }
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }
}

export const config = new Config();

export const {
  isProduction,
  isDevelopment,
  isTest,
  port,
  databaseUrl,
  appBaseUrl,
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  magicLinkAllowedEmails,
  appSessionDays,
  appSessionCookieName,
  allowedOrigins,
} = config;
