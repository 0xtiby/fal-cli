import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleError, withErrorHandling, EXIT_CODES } from './errors.js';

describe('EXIT_CODES', () => {
  it('maps CONFIG_ERROR to 2', () => {
    assert.equal(EXIT_CODES.CONFIG_ERROR, 2);
  });

  it('maps API_ERROR to 3', () => {
    assert.equal(EXIT_CODES.API_ERROR, 3);
  });

  it('maps NETWORK_ERROR to 4', () => {
    assert.equal(EXIT_CODES.NETWORK_ERROR, 4);
  });
});

describe('handleError', () => {
  let stderrOutput;
  let stdoutOutput;
  let exitCode;
  let originalStderrWrite;
  let originalStdoutWrite;
  let originalExit;

  beforeEach(() => {
    stderrOutput = '';
    stdoutOutput = '';
    exitCode = null;

    originalStderrWrite = process.stderr.write;
    originalStdoutWrite = process.stdout.write;
    originalExit = process.exit;

    process.stderr.write = (data) => { stderrOutput += data; };
    process.stdout.write = (data) => { stdoutOutput += data; };
    process.exit = (code) => { exitCode = code; };
  });

  afterEach(() => {
    process.stderr.write = originalStderrWrite;
    process.stdout.write = originalStdoutWrite;
    process.exit = originalExit;
  });

  it('prints error message to stderr', () => {
    handleError({ code: 'API_ERROR', message: 'something failed' });
    assert.equal(stderrOutput, '✗ Error: something failed\n');
  });

  it('exits with code 2 for CONFIG_ERROR', () => {
    handleError({ code: 'CONFIG_ERROR', message: 'missing key' });
    assert.equal(exitCode, 2);
  });

  it('exits with code 3 for API_ERROR', () => {
    handleError({ code: 'API_ERROR', message: 'unauthorized' });
    assert.equal(exitCode, 3);
  });

  it('exits with code 4 for NETWORK_ERROR', () => {
    handleError({ code: 'NETWORK_ERROR', message: 'timeout' });
    assert.equal(exitCode, 4);
  });

  it('exits with code 1 for unknown error codes', () => {
    handleError({ code: 'UNKNOWN', message: 'oops' });
    assert.equal(exitCode, 1);
  });

  it('prints verbose details when verbose is true', () => {
    handleError(
      {
        code: 'API_ERROR',
        message: 'API request failed (401 Unauthorized)',
        details: {
          url: 'https://api.fal.ai/v1/models',
          status: 401,
          response: '{"detail": "Invalid API key"}',
        },
      },
      { verbose: true },
    );
    assert.ok(stderrOutput.includes('✗ Error: API request failed (401 Unauthorized)'));
    assert.ok(stderrOutput.includes('URL:      https://api.fal.ai/v1/models'));
    assert.ok(stderrOutput.includes('Status:   401'));
    assert.ok(stderrOutput.includes('Response: {"detail": "Invalid API key"}'));
  });

  it('does not print details when verbose is false', () => {
    handleError(
      {
        code: 'API_ERROR',
        message: 'failed',
        details: { url: 'https://api.fal.ai/v1/models', status: 401 },
      },
      { verbose: false },
    );
    assert.ok(!stderrOutput.includes('URL:'));
  });

  it('outputs JSON to stdout when json is true', () => {
    handleError(
      { code: 'API_ERROR', message: 'unauthorized', status: 401 },
      { json: true },
    );
    const parsed = JSON.parse(stdoutOutput.trim());
    assert.deepEqual(parsed, {
      error: { code: 'API_ERROR', message: 'unauthorized', status: 401 },
    });
    assert.equal(stderrOutput, '');
  });

  it('omits status from JSON when not provided', () => {
    handleError(
      { code: 'CONFIG_ERROR', message: 'missing key' },
      { json: true },
    );
    const parsed = JSON.parse(stdoutOutput.trim());
    assert.deepEqual(parsed, {
      error: { code: 'CONFIG_ERROR', message: 'missing key' },
    });
  });
});

describe('withErrorHandling', () => {
  let exitCode;
  let stderrOutput;
  let originalExit;
  let originalStderrWrite;
  let originalStdoutWrite;

  beforeEach(() => {
    exitCode = null;
    stderrOutput = '';

    originalExit = process.exit;
    originalStderrWrite = process.stderr.write;
    originalStdoutWrite = process.stdout.write;

    process.exit = (code) => { exitCode = code; };
    process.stderr.write = (data) => { stderrOutput += data; };
    process.stdout.write = () => {};
  });

  afterEach(() => {
    process.exit = originalExit;
    process.stderr.write = originalStderrWrite;
    process.stdout.write = originalStdoutWrite;
  });

  it('calls handler normally when no error', async () => {
    let called = false;
    const wrapped = withErrorHandling(async () => { called = true; });
    await wrapped();
    assert.equal(called, true);
    assert.equal(exitCode, null);
  });

  it('catches CLIError and calls handleError with correct exit code', async () => {
    const wrapped = withErrorHandling(async () => {
      throw { code: 'API_ERROR', message: 'bad request', status: 400 };
    });
    await wrapped();
    assert.equal(exitCode, 3);
    assert.ok(stderrOutput.includes('✗ Error: bad request'));
  });

  it('catches generic Error and exits with code 1', async () => {
    const wrapped = withErrorHandling(async () => {
      throw new Error('something broke');
    });
    await wrapped();
    assert.equal(exitCode, 1);
    assert.ok(stderrOutput.includes('✗ Error: something broke'));
  });

  it('extracts options from last argument for json output', async () => {
    let stdoutOutput = '';
    process.stdout.write = (data) => { stdoutOutput += data; };

    const wrapped = withErrorHandling(async (_arg, _options) => {
      throw { code: 'API_ERROR', message: 'failed', status: 500 };
    });
    await wrapped('someArg', { json: true, verbose: false });
    const parsed = JSON.parse(stdoutOutput.trim());
    assert.equal(parsed.error.code, 'API_ERROR');
    assert.equal(stderrOutput, '');
  });

  it('passes arguments through to handler', async () => {
    let receivedArgs;
    const wrapped = withErrorHandling(async (...args) => {
      receivedArgs = args;
    });
    await wrapped('a', 'b', { json: false });
    assert.deepEqual(receivedArgs, ['a', 'b', { json: false }]);
  });
});
