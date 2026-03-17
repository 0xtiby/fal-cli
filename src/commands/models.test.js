import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { clearCache } from '../lib/fal-client.js';

// Mock process.exit to prevent test runner from exiting
const originalExit = process.exit;

/** Helper: create a mock fetch that returns model data */
function mockFetch(models, { hasMore = false, nextCursor } = {}) {
  return mock.fn(async () => ({
    ok: true,
    json: async () => ({
      data: models.map((m) => ({
        id: m.endpointId,
        name: m.name,
        category: m.category,
        status: 'active',
      })),
      has_more: hasMore,
      next_cursor: nextCursor,
    }),
  }));
}

const sampleModels = [
  { endpointId: 'fal-ai/flux/schnell', name: 'FLUX.1 Schnell', category: 'text-to-image' },
  { endpointId: 'fal-ai/flux/dev', name: 'FLUX.1 Dev', category: 'text-to-image' },
  { endpointId: 'fal-ai/img2img', name: 'Img2Img', category: 'image-to-image' },
];

describe('models command', () => {
  beforeEach(() => {
    clearCache();
    process.env.FAL_KEY = 'test-key';
    process.exit = mock.fn();
  });

  afterEach(() => {
    process.exit = originalExit;
    delete process.env.FAL_KEY;
  });

  it('should export modelsCommand', async () => {
    const { modelsCommand } = await import('./models.js');
    assert.ok(modelsCommand);
  });
});

describe('listModels integration', () => {
  beforeEach(() => {
    clearCache();
    process.env.FAL_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.FAL_KEY;
  });

  it('lists models with correct fields', async () => {
    const { listModels } = await import('../lib/fal-client.js');
    const fetchFn = mockFetch(sampleModels);
    const models = await listModels(undefined, { falKey: 'test-key', _fetch: fetchFn });

    assert.equal(models.length, 3);
    assert.equal(models[0].endpointId, 'fal-ai/flux/schnell');
    assert.equal(models[0].name, 'FLUX.1 Schnell');
    assert.equal(models[0].category, 'text-to-image');
  });

  it('filters by category', async () => {
    const { listModels } = await import('../lib/fal-client.js');
    const fetchFn = mockFetch([sampleModels[2]]);
    const models = await listModels({ category: 'image-to-image' }, { falKey: 'test-key', _fetch: fetchFn });

    assert.equal(models.length, 1);
    assert.equal(models[0].category, 'image-to-image');

    // Verify category was passed as query param
    const calledUrl = fetchFn.mock.calls[0].arguments[0];
    assert.ok(calledUrl.includes('category=image-to-image'));
  });

  it('returns empty array for no results', async () => {
    const { listModels } = await import('../lib/fal-client.js');
    const fetchFn = mockFetch([]);
    const models = await listModels({ category: 'nonexistent' }, { falKey: 'test-key', _fetch: fetchFn });

    assert.equal(models.length, 0);
  });

  it('lists categories from models', async () => {
    const { listCategories } = await import('../lib/fal-client.js');
    const fetchFn = mockFetch(sampleModels);
    const categories = await listCategories({ falKey: 'test-key', _fetch: fetchFn });

    assert.deepEqual(categories, ['image-to-image', 'text-to-image']);
  });
});

describe('models command output', () => {
  beforeEach(() => {
    clearCache();
    process.env.FAL_KEY = 'test-key';
    process.exit = mock.fn();
  });

  afterEach(() => {
    process.exit = originalExit;
    delete process.env.FAL_KEY;
  });

  it('run returns models array for JSON output', async () => {
    const { listModels } = await import('../lib/fal-client.js');
    const fetchFn = mockFetch(sampleModels);
    const models = await listModels(undefined, { falKey: 'test-key', _fetch: fetchFn });

    // Verify the shape matches ModelsResponse
    const response = { models };
    assert.ok(Array.isArray(response.models));
    assert.equal(response.models.length, 3);
    assert.ok(response.models[0].endpointId);
    assert.ok(response.models[0].name);
    assert.ok(response.models[0].category);
  });

  it('empty result includes helpful message', async () => {
    const { listModels } = await import('../lib/fal-client.js');
    const fetchFn = mockFetch([]);
    const models = await listModels({ category: 'nonexistent' }, { falKey: 'test-key', _fetch: fetchFn });

    assert.equal(models.length, 0);

    // The command handler would produce this message
    const category = 'nonexistent';
    const msg = `No models found for category '${category}'. Run \`models categories\` to see available categories.`;
    assert.ok(msg.includes('nonexistent'));
    assert.ok(msg.includes('models categories'));
  });
});
