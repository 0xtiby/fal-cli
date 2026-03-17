import { fal } from '@fal-ai/client';
import { config as dotenvConfig } from 'dotenv';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** @type {string[]} Valid image size presets */
export const IMAGE_SIZE_PRESETS = [
  'square_hd',
  'square',
  'landscape_4_3',
  'landscape_16_9',
  'portrait_4_3',
  'portrait_16_9',
];

/**
 * Load configuration from ~/.fal-cli/.env and merge with shell env vars.
 * Shell env vars take precedence over .env values.
 * Exits with code 2 if FAL_KEY is not set.
 * @param {{ envPath?: string }} [options]
 * @returns {{ falKey: string, defaultModel: string, outputDir: string, imageSize: string, verbose: boolean }}
 */
export function loadConfig(options = {}) {
  const envPath = options.envPath ?? join(homedir(), '.fal-cli', '.env');

  // dotenv does NOT override existing env vars by default,
  // so shell env always takes precedence
  dotenvConfig({ path: envPath });

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    process.stderr.write(
      `Error: FAL_KEY is not set.\n\n` +
      `To set up your API key:\n` +
      `  1. Get your key from https://fal.ai/dashboard/keys\n` +
      `  2. Create ~/.fal-cli/.env with:\n` +
      `     FAL_KEY=your-api-key-here\n` +
      `  Or export it in your shell:\n` +
      `     export FAL_KEY=your-api-key-here\n`
    );
    process.exit(2);
  }

  const verbose = process.env.FAL_VERBOSE;

  return {
    falKey,
    defaultModel: process.env.FAL_DEFAULT_MODEL || 'fal-ai/flux/schnell',
    outputDir: process.env.FAL_OUTPUT_DIR || './generated',
    imageSize: process.env.FAL_IMAGE_SIZE || 'landscape_4_3',
    verbose: !!(verbose && verbose !== '0' && verbose !== 'false'),
  };
}

/**
 * Initialize the @fal-ai/client with the API key from config.
 * Call once at startup after loadConfig().
 * @param {{ falKey: string }} config
 */
export function initFalClient(config) {
  fal.config({ credentials: config.falKey });
}

/**
 * Merge base config with command-level flag overrides.
 * Flag values take precedence; undefined/null values in overrides are ignored.
 * @param {{ falKey: string, defaultModel: string, outputDir: string, imageSize: string, verbose: boolean }} config
 * @param {Partial<{ defaultModel: string, outputDir: string, imageSize: string, verbose: boolean }>} [overrides]
 * @returns {{ falKey: string, defaultModel: string, outputDir: string, imageSize: string, verbose: boolean }}
 */
export function resolveConfig(config, overrides = {}) {
  const result = { ...config };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}
