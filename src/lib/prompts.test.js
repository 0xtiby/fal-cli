import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { promptCategory, promptModel, promptText, promptSize, promptContinue, promptKeepModel } from './prompts.js';

describe('promptCategory', () => {
  it('returns the selected category', async () => {
    const _select = mock.fn(async () => 'text-to-image');

    const result = await promptCategory(['text-to-image', 'image-to-image'], { _select });
    assert.equal(result, 'text-to-image');

    const config = _select.mock.calls[0].arguments[0];
    assert.equal(config.choices.length, 2);
    assert.deepEqual(config.choices[0], { name: 'text-to-image', value: 'text-to-image' });
  });
});

describe('promptModel', () => {
  it('returns selected endpoint ID', async () => {
    const _select = mock.fn(async () => 'fal-ai/flux/schnell');

    const models = [
      { endpointId: 'fal-ai/flux/schnell', name: 'FLUX Schnell' },
      { endpointId: 'fal-ai/flux/dev', name: 'FLUX Dev' },
    ];
    const result = await promptModel(models, { _select });
    assert.equal(result, 'fal-ai/flux/schnell');

    const config = _select.mock.calls[0].arguments[0];
    assert.equal(config.choices[0].name, 'FLUX Schnell');
    assert.equal(config.choices[0].value, 'fal-ai/flux/schnell');
  });
});

describe('promptText', () => {
  it('returns entered text', async () => {
    const _input = mock.fn(async () => 'a red car');

    const result = await promptText({ _input });
    assert.equal(result, 'a red car');
  });

  it('validate rejects empty input', async () => {
    const _input = mock.fn(async (config) => {
      assert.equal(config.validate(''), 'Prompt cannot be empty');
      assert.equal(config.validate('   '), 'Prompt cannot be empty');
      return 'valid input';
    });

    await promptText({ _input });
  });

  it('validate accepts non-empty input', async () => {
    const _input = mock.fn(async (config) => {
      assert.equal(config.validate('hello'), true);
      return 'hello';
    });

    await promptText({ _input });
  });
});

describe('promptSize', () => {
  it('defaults to config value', async () => {
    const _select = mock.fn(async () => 'square_hd');

    const result = await promptSize('square_hd', { _select });
    assert.equal(result, 'square_hd');

    const config = _select.mock.calls[0].arguments[0];
    assert.equal(config.default, 'square_hd');
    assert.equal(config.choices.length, 6);
  });
});

describe('promptContinue', () => {
  it('returns true when user confirms', async () => {
    const _confirm = mock.fn(async () => true);
    const result = await promptContinue({ _confirm });
    assert.equal(result, true);

    const config = _confirm.mock.calls[0].arguments[0];
    assert.equal(config.message, 'Generate another image?');
    assert.equal(config.default, true);
  });

  it('returns false when user declines', async () => {
    const _confirm = mock.fn(async () => false);
    const result = await promptContinue({ _confirm });
    assert.equal(result, false);
  });
});

describe('promptKeepModel', () => {
  it('returns true when user confirms', async () => {
    const _confirm = mock.fn(async () => true);
    const result = await promptKeepModel({ _confirm });
    assert.equal(result, true);

    const config = _confirm.mock.calls[0].arguments[0];
    assert.equal(config.message, 'Keep the same model?');
    assert.equal(config.default, true);
  });

  it('returns false when user declines', async () => {
    const _confirm = mock.fn(async () => false);
    const result = await promptKeepModel({ _confirm });
    assert.equal(result, false);
  });
});
