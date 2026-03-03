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
    .min(16, 'JWT_SECRET must be at least 16 characters long')
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
      // Load .env file (dotenv is imported at entry point)
      const rawEnv = {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        JWT_SECRET: process.env.JWT_SECRET,
        DEFAULT_PASSWORD: process.env.DEFAULT_PASSWORD,
        DATABASE_URL: process.env.DATABASE_URL,
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
        
        // In production, we should exit with error code
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
  
  // Helper to check if we're running in a secure configuration
  validateSecurity(): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    if (this.isProduction) {
      if (this.config.DEFAULT_PASSWORD && this.config.DEFAULT_PASSWORD.length < 12) {
        warnings.push('DEFAULT_PASSWORD is less than 12 characters in production - consider using stronger default');
      }
      
      if (this.config.JWT_SECRET && this.config.JWT_SECRET.length < 32) {
        warnings.push('JWT_SECRET is less than 32 characters in production - consider using a longer secret');
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

// Singleton instance
export const config = new Config();

// Convenience exports
export const {
  isProduction,
  isDevelopment,
  isTest,
  port,
  jwtSecret,
  defaultPassword,
  databaseUrl,
} = config;