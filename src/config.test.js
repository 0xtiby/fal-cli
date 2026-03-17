import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, initFalClient, IMAGE_SIZE_PRESETS } from './config.js';

const testDir = join(tmpdir(), `fal-cli-test-${process.pid}`);
const envPath = join(testDir, '.env');

let savedEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
  // Clear all FAL_ vars to isolate tests
  delete process.env.FAL_KEY;
  delete process.env.FAL_DEFAULT_MODEL;
  delete process.env.FAL_OUTPUT_DIR;
  delete process.env.FAL_IMAGE_SIZE;
  delete process.env.FAL_VERBOSE;
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  process.env = savedEnv;
  rmSync(testDir, { recursive: true, force: true });
});

function writeEnv(vars) {
  const content = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n');
  writeFileSync(envPath, content);
}

describe('loadConfig', () => {
  it('returns correct config from .env values', () => {
    writeEnv({
      FAL_KEY: 'test-key-123',
      FAL_DEFAULT_MODEL: 'fal-ai/flux/dev',
      FAL_OUTPUT_DIR: '/tmp/out',
      FAL_IMAGE_SIZE: 'square_hd',
    });

    const config = loadConfig({ envPath });
    assert.equal(config.falKey, 'test-key-123');
    assert.equal(config.defaultModel, 'fal-ai/flux/dev');
    assert.equal(config.outputDir, '/tmp/out');
    assert.equal(config.imageSize, 'square_hd');
    assert.equal(config.verbose, false);
  });

  it('shell env vars override .env values', () => {
    writeEnv({ FAL_KEY: 'dotenv-key' });
    process.env.FAL_KEY = 'shell-key';

    const config = loadConfig({ envPath });
    assert.equal(config.falKey, 'shell-key');
  });

  it('works with missing .env but FAL_KEY in shell env', () => {
    process.env.FAL_KEY = 'shell-only-key';
    const nonExistentPath = join(testDir, 'nonexistent', '.env');

    const config = loadConfig({ envPath: nonExistentPath });
    assert.equal(config.falKey, 'shell-only-key');
  });

  it('applies defaults for optional vars', () => {
    writeEnv({ FAL_KEY: 'test-key' });

    const config = loadConfig({ envPath });
    assert.equal(config.defaultModel, 'fal-ai/flux/schnell');
    assert.equal(config.outputDir, './generated');
    assert.equal(config.imageSize, 'landscape_4_3');
  });

  it('exits with code 2 when FAL_KEY is missing', () => {
    const nonExistentPath = join(testDir, 'nonexistent', '.env');

    const originalExit = process.exit;
    const originalWrite = process.stderr.write;
    let exitCode = null;
    let stderrOutput = '';

    process.exit = (code) => { exitCode = code; throw new Error('EXIT'); };
    process.stderr.write = (msg) => { stderrOutput += msg; return true; };

    try {
      loadConfig({ envPath: nonExistentPath });
      assert.fail('should have exited');
    } catch (e) {
      assert.equal(e.message, 'EXIT');
    } finally {
      process.exit = originalExit;
      process.stderr.write = originalWrite;
    }

    assert.equal(exitCode, 2);
    assert.ok(stderrOutput.includes('FAL_KEY'));
    assert.ok(stderrOutput.includes('https://fal.ai/dashboard/keys'));
  });

  it('sets verbose=true when FAL_VERBOSE=1', () => {
    writeEnv({ FAL_KEY: 'test-key', FAL_VERBOSE: '1' });

    const config = loadConfig({ envPath });
    assert.equal(config.verbose, true);
  });

  it('sets verbose=false when FAL_VERBOSE=0', () => {
    writeEnv({ FAL_KEY: 'test-key', FAL_VERBOSE: '0' });

    const config = loadConfig({ envPath });
    assert.equal(config.verbose, false);
  });

  it('sets verbose=false when FAL_VERBOSE=false', () => {
    writeEnv({ FAL_KEY: 'test-key', FAL_VERBOSE: 'false' });

    const config = loadConfig({ envPath });
    assert.equal(config.verbose, false);
  });

  it('sets verbose=true for truthy FAL_VERBOSE values', () => {
    writeEnv({ FAL_KEY: 'test-key', FAL_VERBOSE: 'yes' });

    const config = loadConfig({ envPath });
    assert.equal(config.verbose, true);
  });
});

describe('initFalClient', () => {
  it('does not throw with valid config', () => {
    assert.doesNotThrow(() => {
      initFalClient({ falKey: 'test-key-123' });
    });
  });

  it('exports initFalClient as a function', () => {
    assert.equal(typeof initFalClient, 'function');
  });
});

describe('IMAGE_SIZE_PRESETS', () => {
  it('exports all expected presets', () => {
    assert.ok(Array.isArray(IMAGE_SIZE_PRESETS));
    assert.ok(IMAGE_SIZE_PRESETS.includes('square_hd'));
    assert.ok(IMAGE_SIZE_PRESETS.includes('square'));
    assert.ok(IMAGE_SIZE_PRESETS.includes('landscape_4_3'));
    assert.ok(IMAGE_SIZE_PRESETS.includes('landscape_16_9'));
    assert.ok(IMAGE_SIZE_PRESETS.includes('portrait_4_3'));
    assert.ok(IMAGE_SIZE_PRESETS.includes('portrait_16_9'));
    assert.equal(IMAGE_SIZE_PRESETS.length, 6);
  });
});
