#!/usr/bin/env node

/**
 * Setup script for Nido environment configuration
 * Generates secure .env file from .env.example with random secrets
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const envExamplePath = join(rootDir, '.env.example');
const envPath = join(rootDir, '.env');

function generateSecret(length = 32) {
  return randomBytes(length).toString('hex');
}

function generatePassword() {
  return generateSecret(16); // 32 hex chars = 16 bytes
}

function main() {
  console.log('🔧 Nido Environment Setup');
  console.log('=========================\n');
  
  // Check if .env already exists
  if (existsSync(envPath)) {
    console.log('⚠️  .env file already exists.');
    const overwrite = process.argv.includes('--force');
    if (!overwrite) {
      console.log('   Use --force to overwrite, or edit manually.');
      console.log('   Exiting.');
      process.exit(0);
    }
    console.log('   Overwriting as requested...');
  }
  
  // Read template
  let template;
  try {
    template = readFileSync(envExamplePath, 'utf8');
  } catch (error) {
    console.error(`❌ Cannot read ${envExamplePath}:`, error.message);
    process.exit(1);
  }
  
  // Generate replacements
  const replacements = {
    'change-me-to-a-random-secret-minimum-32-chars': generateSecret(32),
    'change-me-to-a-strong-password': generatePassword(),
  };
  
  // Apply replacements
  let result = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(placeholder, value);
  }
  
  // Write .env file
  try {
    writeFileSync(envPath, result, 'utf8');
    console.log('✅ Generated .env file with secure random secrets:');
    console.log(`   📁 ${envPath}\n`);
    
    // Show summary of generated values (redacted for security)
    const lines = result.split('\n');
    lines.forEach(line => {
      if (line.includes('=') && !line.startsWith('#')) {
        const [key, value] = line.split('=');
        if (value && !value.includes('#')) {
          const displayValue = value.length > 8 
            ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}`
            : '***';
          console.log(`   ${key}=${displayValue}`);
        }
      }
    });
    
    console.log('\n💡 Next steps:');
    console.log('   1. Review the generated .env file');
    console.log('   2. Start development server: npm run dev');
    console.log('   3. For production, set these as environment variables');
    console.log('      (not as .env file) on your server.');
    
  } catch (error) {
    console.error(`❌ Failed to write ${envPath}:`, error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateSecret, generatePassword };