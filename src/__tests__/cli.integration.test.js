import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '..', 'index.js');

/**
 * Spawn the CLI with given args and env overrides.
 * Returns { stdout, stderr, exitCode }.
 */
function runCli(args = [], envOverrides = {}) {
  return new Promise((resolve) => {
    // Build env: start from clean env with only essentials, apply overrides
    const env = {
      ...process.env,
      FAL_KEY: 'test-key-for-integration',
      // Suppress dotenv debug tips by pointing to a nonexistent file
      DOTENV_CONFIG_PATH: '/dev/null',
      ...envOverrides,
    };

    execFile('node', [CLI_PATH, ...args], { env, timeout: 10_000 }, (error, stdout, stderr) => {
      resolve({
        stdout,
        stderr,
        exitCode: error ? error.code : 0,
      });
    });
  });
}

describe('CLI integration', () => {
  it('no args shows help text listing commands, exits 0', async () => {
    const { stdout, exitCode } = await runCli([]);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('fal-cli'), 'should mention fal-cli');
    assert.ok(stdout.includes('models'), 'should list models command');
    assert.ok(stdout.includes('interactive'), 'should list interactive command');
  });

  it('--version prints version, exits 0', async () => {
    const { stdout, exitCode } = await runCli(['--version']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.trim().includes('0.1.0'), 'should print version 0.1.0');
  });

  it('--help shows description and command list, exits 0', async () => {
    const { stdout, exitCode } = await runCli(['--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('Generate and edit images via fal.ai'), 'should show description');
    assert.ok(stdout.includes('models'), 'should list models command');
    assert.ok(stdout.includes('interactive'), 'should list interactive command');
  });

  it('unknown command shows error, exits 1', async () => {
    const { stdout, stderr, exitCode } = await runCli(['nonexistent']);
    const output = stdout + stderr;
    assert.equal(exitCode, 1);
    assert.ok(
      output.includes('not a command') || output.includes('COMMAND_NOT_FOUND'),
      'should show helpful error for unknown command',
    );
  });

  it('unknown flag shows error, exits 1', async () => {
    const { stdout, stderr, exitCode } = await runCli(['--does-not-exist']);
    const output = stdout + stderr;
    assert.equal(exitCode, 1);
    assert.ok(
      output.includes('not a command') || output.includes('COMMAND_NOT_FOUND'),
      'should show error for unknown flag',
    );
  });

  it('missing FAL_KEY exits with code 2 and config error message', async () => {
    const { stderr, exitCode } = await runCli([], {
      FAL_KEY: '',
      // Point dotenv to nonexistent path so it can't load a key
      DOTENV_CONFIG_PATH: '/dev/null',
    });
    assert.equal(exitCode, 2);
    assert.ok(stderr.includes('FAL_KEY'), 'should mention FAL_KEY in error');
  });

  it('--llms flag returns a manifest describing commands', async () => {
    const { stdout, exitCode } = await runCli(['--llms']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('fal-cli'), 'manifest should reference fal-cli');
    assert.ok(stdout.includes('models') || stdout.includes('interactive'), 'manifest should list commands');
  });
});
