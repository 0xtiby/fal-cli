import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runInteractiveFlow } from './interactive.js';

function makeDeps(overrides = {}) {
  const stdout = { write: mock.fn() };
  const spinnerInstance = {
    text: '',
    start() { return this; },
    succeed: mock.fn(),
  };
  const oraFn = mock.fn(() => spinnerInstance);

  return {
    deps: {
      loadConfig: mock.fn(() => ({
        falKey: 'test-key',
        defaultModel: 'fal-ai/flux/schnell',
        outputDir: './generated',
        imageSize: 'landscape_4_3',
        verbose: false,
      })),
      listCategories: mock.fn(async () => ['text-to-image', 'image-to-image']),
      listModels: mock.fn(async () => [
        { endpointId: 'fal-ai/flux/schnell', name: 'FLUX Schnell' },
        { endpointId: 'fal-ai/flux/dev', name: 'FLUX Dev' },
      ]),
      generateImage: mock.fn(async () => ({
        url: 'https://cdn.fal.ai/test.png',
        width: 1024,
        height: 768,
        seed: 42,
      })),
      saveImage: mock.fn(async () => './generated/2026-03-17_120000_flux-schnell.png'),
      promptCategory: mock.fn(async () => 'text-to-image'),
      promptModel: mock.fn(async () => 'fal-ai/flux/schnell'),
      promptText: mock.fn(async () => 'a beautiful sunset'),
      promptSize: mock.fn(async () => 'landscape_4_3'),
      promptContinue: mock.fn(async () => false),
      promptKeepModel: mock.fn(async () => true),
      ora: oraFn,
      stdout,
      ...overrides,
    },
    spinnerInstance,
    oraFn,
    stdout,
  };
}

describe('interactive command', () => {
  it('calls prompt helpers in correct order', async () => {
    const { deps } = makeDeps();
    await runInteractiveFlow({ _deps: deps });

    // loadConfig called first
    assert.equal(deps.loadConfig.mock.callCount(), 1);

    // listCategories → promptCategory
    assert.equal(deps.listCategories.mock.callCount(), 1);
    assert.equal(deps.promptCategory.mock.callCount(), 1);
    assert.deepEqual(deps.promptCategory.mock.calls[0].arguments[0], [
      'text-to-image',
      'image-to-image',
    ]);

    // listModels(category) → promptModel
    assert.equal(deps.listModels.mock.callCount(), 1);
    assert.deepEqual(deps.listModels.mock.calls[0].arguments[0], {
      category: 'text-to-image',
    });
    assert.equal(deps.promptModel.mock.callCount(), 1);

    // promptText → promptSize
    assert.equal(deps.promptText.mock.callCount(), 1);
    assert.equal(deps.promptSize.mock.callCount(), 1);
    assert.equal(deps.promptSize.mock.calls[0].arguments[0], 'landscape_4_3');
  });

  it('starts spinner before generateImage and succeeds after saveImage', async () => {
    const callOrder = [];
    const { deps, spinnerInstance, oraFn } = makeDeps({
      generateImage: mock.fn(async () => {
        callOrder.push('generateImage');
        return { url: 'https://cdn.fal.ai/test.png', width: 1024, height: 768, seed: 42 };
      }),
      saveImage: mock.fn(async () => {
        callOrder.push('saveImage');
        return './generated/test.png';
      }),
    });

    // Track spinner start
    spinnerInstance.start = mock.fn(() => {
      callOrder.push('spinnerStart');
      return spinnerInstance;
    });
    spinnerInstance.succeed = mock.fn(() => {
      callOrder.push('spinnerSucceed');
    });

    await runInteractiveFlow({ _deps: deps });

    assert.deepEqual(callOrder, [
      'spinnerStart',
      'generateImage',
      'saveImage',
      'spinnerSucceed',
    ]);
  });

  it('passes onStatus callback that updates spinner text', async () => {
    let capturedOnStatus;
    const { deps, spinnerInstance } = makeDeps({
      generateImage: mock.fn(async (_input, onStatus) => {
        capturedOnStatus = onStatus;
        return { url: 'https://cdn.fal.ai/test.png', width: 1024, height: 768, seed: 42 };
      }),
    });

    await runInteractiveFlow({ _deps: deps });

    // Simulate queue status updates
    capturedOnStatus({ status: 'IN_QUEUE', position: 3 });
    assert.equal(spinnerInstance.text, 'In queue (position 3)...');

    capturedOnStatus({ status: 'IN_QUEUE' });
    assert.equal(spinnerInstance.text, 'In queue...');

    capturedOnStatus({ status: 'IN_PROGRESS' });
    assert.equal(spinnerInstance.text, 'Generating...');
  });

  it('prints summary to stdout', async () => {
    const { deps, stdout } = makeDeps();
    await runInteractiveFlow({ _deps: deps });

    const output = stdout.write.mock.calls[0].arguments[0];
    assert.ok(output.includes('fal-ai/flux/schnell'));
    assert.ok(output.includes('landscape_4_3'));
    assert.ok(output.includes('42'));
    assert.ok(output.includes('./generated/2026-03-17_120000_flux-schnell.png'));
  });

  it('calls generateImage with correct input', async () => {
    const { deps } = makeDeps();
    await runInteractiveFlow({ _deps: deps });

    const [input] = deps.generateImage.mock.calls[0].arguments;
    assert.deepEqual(input, {
      model: 'fal-ai/flux/schnell',
      prompt: 'a beautiful sunset',
      image_size: 'landscape_4_3',
    });
  });

  it('loops when promptContinue returns true and keepModel true', async () => {
    let continueCallCount = 0;
    const { deps } = makeDeps({
      promptContinue: mock.fn(async () => {
        continueCallCount++;
        return continueCallCount <= 2; // continue twice, then stop
      }),
      promptKeepModel: mock.fn(async () => true),
    });

    await runInteractiveFlow({ _deps: deps });

    // Should generate 3 times (initial + 2 continues)
    assert.equal(deps.generateImage.mock.callCount(), 3);
    // Model selection only happens once (at the start)
    assert.equal(deps.promptModel.mock.callCount(), 1);
    // promptText called each iteration
    assert.equal(deps.promptText.mock.callCount(), 3);
  });

  it('exits loop when promptContinue returns false', async () => {
    const { deps } = makeDeps({
      promptContinue: mock.fn(async () => false),
    });

    await runInteractiveFlow({ _deps: deps });

    assert.equal(deps.generateImage.mock.callCount(), 1);
    assert.equal(deps.promptContinue.mock.callCount(), 1);
    // promptKeepModel should not be called when not continuing
    assert.equal(deps.promptKeepModel.mock.callCount(), 0);
  });

  it('re-selects model when keepModel returns false', async () => {
    let continueCallCount = 0;
    const { deps } = makeDeps({
      promptContinue: mock.fn(async () => {
        continueCallCount++;
        return continueCallCount <= 1; // continue once, then stop
      }),
      promptKeepModel: mock.fn(async () => false),
    });

    await runInteractiveFlow({ _deps: deps });

    // Should generate 2 times
    assert.equal(deps.generateImage.mock.callCount(), 2);
    // Category + model selection happens twice (initial + re-selection)
    assert.equal(deps.listCategories.mock.callCount(), 2);
    assert.equal(deps.promptCategory.mock.callCount(), 2);
    assert.equal(deps.listModels.mock.callCount(), 2);
    assert.equal(deps.promptModel.mock.callCount(), 2);
  });

  it('skips model selection when keepModel returns true', async () => {
    let continueCallCount = 0;
    const { deps } = makeDeps({
      promptContinue: mock.fn(async () => {
        continueCallCount++;
        return continueCallCount <= 1;
      }),
      promptKeepModel: mock.fn(async () => true),
    });

    await runInteractiveFlow({ _deps: deps });

    assert.equal(deps.generateImage.mock.callCount(), 2);
    // Category + model selection only once
    assert.equal(deps.listCategories.mock.callCount(), 1);
    assert.equal(deps.promptCategory.mock.callCount(), 1);
    assert.equal(deps.promptModel.mock.callCount(), 1);
  });
});
