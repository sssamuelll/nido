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

  // Security - these must be set and meet security requirements
  JWT_SECRET: z.string()
    .min(32, 'JWT_SECRET must be at least 32 characters long')
    .refine(secret => ![
      'change-me-to-a-random-secret-minimum-32-chars',
      'nido-secret-key-2026',
      'nido-default-secret-key-change-me-in-prod',
    ].includes(secret), {
      message: 'JWT_SECRET must be a strong, unique value',
    })
    .optional()
    .default('nido-default-secret-key-change-me-in-prod'),

  DEFAULT_PASSWORD: z.string()
    .min(8, 'DEFAULT_PASSWORD must be at least 8 characters long')
    .refine(pass => !pass.includes('change-me'), {
      message: 'DEFAULT_PASSWORD must be changed from the default example',
    })
    .optional(), // Optional in production if users already exist

  // Database
  DATABASE_URL: z.string().optional(),

  // Auth v2 / Supabase
  APP_BASE_URL: z.string().url().default('http://localhost:3100'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  MAGIC_LINK_ALLOWED_EMAILS: z.string().optional(),
  APP_SESSION_DAYS: z.string().regex(/^\d+$/).transform(Number).default('30'),
  APP_SESSION_COOKIE_NAME: z.string().min(1).default('nido_session'),
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
        JWT_SECRET: process.env.JWT_SECRET,
        DEFAULT_PASSWORD: process.env.DEFAULT_PASSWORD,
        DATABASE_URL: process.env.DATABASE_URL,
        APP_BASE_URL: process.env.APP_BASE_URL,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        MAGIC_LINK_ALLOWED_EMAILS: process.env.MAGIC_LINK_ALLOWED_EMAILS,
        APP_SESSION_DAYS: process.env.APP_SESSION_DAYS,
        APP_SESSION_COOKIE_NAME: process.env.APP_SESSION_COOKIE_NAME,
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

  get jwtSecret(): string {
    return this.config.JWT_SECRET;
  }

  get defaultPassword(): string | undefined {
    return this.config.DEFAULT_PASSWORD;
  }

  get databaseUrl(): string | undefined {
    return this.config.DATABASE_URL;
  }

  get appBaseUrl(): string {
    return this.config.APP_BASE_URL;
  }

  get supabaseUrl(): string | undefined {
    return this.config.SUPABASE_URL;
  }

  get supabaseAnonKey(): string | undefined {
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

  get isSupabaseAuthConfigured(): boolean {
    return Boolean(this.config.SUPABASE_URL && this.config.SUPABASE_ANON_KEY);
  }

  validateSecurity(): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (this.isProduction) {
      if (this.config.DEFAULT_PASSWORD && this.config.DEFAULT_PASSWORD.length < 12) {
        warnings.push('DEFAULT_PASSWORD is less than 12 characters in production - consider using stronger default');
      }

      if (this.config.JWT_SECRET && this.config.JWT_SECRET.length < 64) {
        warnings.push('JWT_SECRET is less than 64 characters in production - consider using a longer secret');
      }
    }

    if (this.isDevelopment) {
      if (this.config.JWT_SECRET && this.config.JWT_SECRET.includes('nido-secret-key')) {
        warnings.push('JWT_SECRET appears to be the development default - generate a unique secret for production');
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
  jwtSecret,
  defaultPassword,
  databaseUrl,
  appBaseUrl,
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  magicLinkAllowedEmails,
  appSessionDays,
  appSessionCookieName,
  isSupabaseAuthConfigured,
} = config;
