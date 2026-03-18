import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { runGenerateHandler } from './generate.js';

function makeDeps(overrides = {}) {
  return {
    loadConfig: () => ({
      falKey: 'test-key',
      defaultModel: 'fal-ai/flux/schnell',
      outputDir: './generated',
      imageSize: 'landscape_4_3',
      verbose: false,
    }),
    resolveConfig: (config, ov) => ({ ...config, ...Object.fromEntries(Object.entries(ov).filter(([, v]) => v != null)) }),
    resolveImageUrl: async (src) => `https://fal.media/uploaded/${src}`,
    runGeneration: async () => ({
      data: {
        images: [{ url: 'https://fal.media/out.png', width: 1024, height: 768 }],
        seed: 42,
      },
      requestId: 'req-123',
    }),
    extractOutputFiles: (data) => {
      if (data.images) return data.images.map((img) => ({ url: img.url, width: img.width, height: img.height }));
      return [];
    },
    saveFile: async (url, outputDir, modelId, opts) => ({
      localPath: `${outputDir}/2026-03-18_143022_flux-schnell${opts?.suffix || ''}.png`,
      contentType: 'image/png',
    }),
    ora: () => ({ start: function() { return this; }, stop: () => {}, succeed: () => {}, fail: () => {}, warn: () => {} }),
    stdout: { write: () => {} },
    stderr: { write: () => {} },
    exit: mock.fn(),
    processOn: mock.fn(),
    processRemoveListener: mock.fn(),
    ...overrides,
  };
}

function makeContext(options = {}) {
  return {
    options: {
      model: 'fal-ai/flux/schnell',
      prompt: 'a sunset',
      image: undefined,
      size: undefined,
      output: undefined,
      seed: undefined,
      category: undefined,
      verbose: undefined,
      ...options,
    },
  };
}

describe('generate command', () => {
  it('runs full flow and returns GenerateResult', async () => {
    const deps = makeDeps();
    const c = makeContext();
    const result = await runGenerateHandler(c, { _deps: deps });

    assert.equal(result.model, 'fal-ai/flux/schnell');
    assert.equal(result.seed, 42);
    assert.equal(result.requestId, 'req-123');
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].localPath, './generated/2026-03-18_143022_flux-schnell.png');
    assert.equal(result.files[0].contentType, 'image/png');
    assert.equal(result.files[0].width, 1024);
    assert.equal(result.files[0].height, 768);
  });

  it('passes --seed to generation input', async () => {
    let capturedInput;
    const deps = makeDeps({
      runGeneration: async (input) => {
        capturedInput = input;
        return {
          data: { images: [{ url: 'https://fal.media/out.png', width: 512, height: 512 }], seed: 99 },
          requestId: 'req-456',
        };
      },
    });
    const c = makeContext({ seed: 99 });
    await runGenerateHandler(c, { _deps: deps });

    assert.equal(capturedInput.seed, 99);
  });

  it('splits comma-separated --image values', async () => {
    let resolvedSources = [];
    const deps = makeDeps({
      resolveImageUrl: async (src) => {
        resolvedSources.push(src);
        return `https://fal.media/${src}`;
      },
    });
    const c = makeContext({ image: ['a.jpg,b.jpg', 'c.jpg'] });
    await runGenerateHandler(c, { _deps: deps });

    assert.deepEqual(resolvedSources, ['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('resolves multiple --image flags', async () => {
    let capturedInput;
    const deps = makeDeps({
      runGeneration: async (input) => {
        capturedInput = input;
        return {
          data: { images: [{ url: 'https://fal.media/out.png', width: 512, height: 512 }], seed: 1 },
          requestId: 'req-789',
        };
      },
    });
    const c = makeContext({ image: ['a.jpg', 'b.jpg'] });
    await runGenerateHandler(c, { _deps: deps });

    assert.equal(capturedInput.image_urls.length, 2);
    assert.equal(capturedInput.image_url, capturedInput.image_urls[0]);
  });

  it('overrides --output directory', async () => {
    let savedOutputDir;
    const deps = makeDeps({
      saveFile: async (url, outputDir, modelId, opts) => {
        savedOutputDir = outputDir;
        return { localPath: `${outputDir}/file.png`, contentType: 'image/png' };
      },
    });
    const c = makeContext({ output: './custom-dir' });
    await runGenerateHandler(c, { _deps: deps });

    assert.equal(savedOutputDir, './custom-dir');
  });

  it('registers SIGINT handler before generation and removes after', async () => {
    const deps = makeDeps();
    const c = makeContext();
    await runGenerateHandler(c, { _deps: deps });

    assert.equal(deps.processOn.mock.calls.length, 1);
    assert.equal(deps.processOn.mock.calls[0].arguments[0], 'SIGINT');
    assert.ok(deps.processRemoveListener.mock.calls.length >= 1);
    assert.equal(deps.processRemoveListener.mock.calls[0].arguments[0], 'SIGINT');
  });

  it('includes category in result when provided', async () => {
    const deps = makeDeps();
    const c = makeContext({ category: 'text-to-image' });
    const result = await runGenerateHandler(c, { _deps: deps });

    assert.equal(result.category, 'text-to-image');
  });

  it('handles multi-file output with suffixes', async () => {
    const savedCalls = [];
    const deps = makeDeps({
      runGeneration: async () => ({
        data: {
          images: [
            { url: 'https://fal.media/out1.png', width: 512, height: 512 },
            { url: 'https://fal.media/out2.png', width: 512, height: 512 },
          ],
          seed: 7,
        },
        requestId: 'req-multi',
      }),
      extractOutputFiles: (data) => data.images.map((img) => ({ url: img.url, width: img.width, height: img.height })),
      saveFile: async (url, outputDir, modelId, opts) => {
        savedCalls.push(opts?.suffix);
        return { localPath: `${outputDir}/file${opts?.suffix || ''}.png`, contentType: 'image/png' };
      },
    });
    const c = makeContext();
    const result = await runGenerateHandler(c, { _deps: deps });

    assert.equal(result.files.length, 2);
    assert.deepEqual(savedCalls, ['_001', '_002']);
  });

  it('shows verbose output when --verbose is set', async () => {
    let stderrOutput = '';
    const deps = makeDeps({
      stderr: { write: (s) => { stderrOutput += s; } },
    });
    const c = makeContext({ verbose: true });
    await runGenerateHandler(c, { _deps: deps });

    assert.ok(stderrOutput.includes('Request:'));
    assert.ok(stderrOutput.includes('Response:'));
  });

  it('handles no output files gracefully', async () => {
    const deps = makeDeps({
      runGeneration: async () => ({
        data: { result: 'something without files' },
        requestId: 'req-empty',
      }),
      extractOutputFiles: () => [],
    });
    const c = makeContext();
    const result = await runGenerateHandler(c, { _deps: deps });

    assert.equal(result.files.length, 0);
    assert.equal(result.requestId, 'req-empty');
  });

  it('returns GenerateResult matching --json shape with all fields', async () => {
    const deps = makeDeps();
    const c = makeContext({ seed: 42, category: 'text-to-image' });
    const result = await runGenerateHandler(c, { _deps: deps });

    // Validate exact shape: model, seed, requestId, category, files[]
    assert.deepEqual(Object.keys(result).sort(), ['category', 'files', 'model', 'requestId', 'seed'].sort());
    assert.equal(typeof result.model, 'string');
    assert.equal(typeof result.seed, 'number');
    assert.equal(typeof result.requestId, 'string');
    assert.equal(typeof result.category, 'string');
    assert.ok(Array.isArray(result.files));

    // Validate file entry shape
    const file = result.files[0];
    assert.equal(typeof file.localPath, 'string');
    assert.equal(typeof file.url, 'string');
    assert.equal(typeof file.contentType, 'string');
    assert.equal(typeof file.width, 'number');
    assert.equal(typeof file.height, 'number');
  });

  it('omits seed and category from result when not present', async () => {
    const deps = makeDeps({
      runGeneration: async () => ({
        data: { images: [{ url: 'https://fal.media/out.png', width: 512, height: 512 }] },
        requestId: 'req-noseed',
      }),
    });
    const c = makeContext(); // no seed, no category
    const result = await runGenerateHandler(c, { _deps: deps });

    assert.ok(!('seed' in result), 'seed should be absent when not in API response');
    assert.ok(!('category' in result), 'category should be absent when not provided');
    assert.equal(result.model, 'fal-ai/flux/schnell');
    assert.equal(result.requestId, 'req-noseed');
    assert.equal(result.files.length, 1);
  });

  it('file entries omit width/height when not provided', async () => {
    const deps = makeDeps({
      runGeneration: async () => ({
        data: { video: { url: 'https://fal.media/out.mp4' } },
        requestId: 'req-video',
      }),
      extractOutputFiles: (data) => [{ url: data.video.url }],
      saveFile: async (url, outputDir, modelId, opts) => ({
        localPath: `${outputDir}/video.mp4`,
        contentType: 'video/mp4',
      }),
    });
    const c = makeContext();
    const result = await runGenerateHandler(c, { _deps: deps });

    const file = result.files[0];
    assert.equal(file.contentType, 'video/mp4');
    assert.ok(!('width' in file), 'width should be absent for non-image output');
    assert.ok(!('height' in file), 'height should be absent for non-image output');
  });

  it('verbose prints response when no output files found', async () => {
    let stderrOutput = '';
    const responseData = { custom_field: 'unknown shape' };
    const deps = makeDeps({
      runGeneration: async () => ({
        data: responseData,
        requestId: 'req-empty-verbose',
      }),
      extractOutputFiles: () => [],
      stderr: { write: (s) => { stderrOutput += s; } },
    });
    const c = makeContext({ verbose: true });
    await runGenerateHandler(c, { _deps: deps });

    assert.ok(stderrOutput.includes('Response:'));
    assert.ok(stderrOutput.includes('unknown shape'));
  });

  it('SIGINT handler stops spinner and exits 0', async () => {
    let sigintHandler;
    const spinnerStopped = { value: false };
    const deps = makeDeps({
      processOn: mock.fn((event, handler) => { if (event === 'SIGINT') sigintHandler = handler; }),
      ora: () => ({
        start() { return this; },
        stop() { spinnerStopped.value = true; },
        succeed() {},
        fail() {},
        warn() {},
      }),
      runGeneration: async (input, onStatus) => {
        // Trigger SIGINT mid-generation
        sigintHandler();
        return {
          data: { images: [{ url: 'https://fal.media/out.png', width: 512, height: 512 }], seed: 1 },
          requestId: 'req-sigint',
        };
      },
    });
    const c = makeContext();
    await runGenerateHandler(c, { _deps: deps });

    assert.ok(spinnerStopped.value, 'spinner should be stopped on SIGINT');
    assert.equal(deps.exit.mock.calls.length, 1);
    assert.equal(deps.exit.mock.calls[0].arguments[0], 0);
  });

  it('removes SIGINT handler even when runGeneration throws', async () => {
    const deps = makeDeps({
      runGeneration: async () => { throw new Error('API timeout'); },
    });
    const c = makeContext();

    await assert.rejects(
      () => runGenerateHandler(c, { _deps: deps }),
      (err) => err.message === 'API timeout',
    );

    // SIGINT handler should still be cleaned up
    assert.ok(deps.processRemoveListener.mock.calls.length >= 1);
    assert.equal(deps.processRemoveListener.mock.calls[0].arguments[0], 'SIGINT');
  });
});
