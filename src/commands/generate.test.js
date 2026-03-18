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
});
