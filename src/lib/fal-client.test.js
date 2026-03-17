import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { listModels, listCategories, clearCache } from './fal-client.js';

/**
 * Create a mock fetch function that returns predefined responses.
 * @param {Array<{ status: number, body: any }>} responses - Responses to return in order
 * @returns {{ fetch: Function, calls: Array<{ url: string, options: any }> }}
 */
function mockFetch(responses) {
  const calls = [];
  let callIndex = 0;

  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    const response = responses[callIndex++];
    if (response.error) {
      throw new Error(response.error);
    }
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body ?? ''),
    };
  };

  return { fetch: fetchFn, calls };
}

const TEST_OPTIONS = { falKey: 'test-key-123' };

describe('listModels', () => {
  beforeEach(() => {
    clearCache();
  });

  it('fetches and maps a single-page response', async () => {
    const { fetch: fetchFn } = mockFetch([
      {
        status: 200,
        body: {
          data: [
            { id: 'fal-ai/flux/schnell', name: 'FLUX.1 Schnell', category: 'text-to-image', status: 'active' },
            { id: 'fal-ai/recraft/v4', name: 'Recraft V4', category: 'text-to-image', status: 'active' },
          ],
          has_more: false,
          next_cursor: null,
        },
      },
    ]);

    const models = await listModels(undefined, { ...TEST_OPTIONS, _fetch: fetchFn });

    assert.equal(models.length, 2);
    assert.deepEqual(models[0], {
      endpointId: 'fal-ai/flux/schnell',
      name: 'FLUX.1 Schnell',
      category: 'text-to-image',
    });
    assert.deepEqual(models[1], {
      endpointId: 'fal-ai/recraft/v4',
      name: 'Recraft V4',
      category: 'text-to-image',
    });
  });

  it('follows pagination across multiple pages', async () => {
    const { fetch: fetchFn, calls } = mockFetch([
      {
        status: 200,
        body: {
          data: [{ id: 'model-1', name: 'Model 1', category: 'text-to-image', status: 'active' }],
          has_more: true,
          next_cursor: 'cursor-page-2',
        },
      },
      {
        status: 200,
        body: {
          data: [{ id: 'model-2', name: 'Model 2', category: 'image-to-image', status: 'active' }],
          has_more: false,
          next_cursor: null,
        },
      },
    ]);

    const models = await listModels(undefined, { ...TEST_OPTIONS, _fetch: fetchFn });

    assert.equal(models.length, 2);
    assert.equal(models[0].endpointId, 'model-1');
    assert.equal(models[1].endpointId, 'model-2');

    // Verify second call includes cursor
    assert.equal(calls.length, 2);
    const secondUrl = new URL(calls[1].url);
    assert.equal(secondUrl.searchParams.get('cursor'), 'cursor-page-2');
  });

  it('passes category as query parameter', async () => {
    const { fetch: fetchFn, calls } = mockFetch([
      {
        status: 200,
        body: { data: [], has_more: false },
      },
    ]);

    await listModels({ category: 'text-to-image' }, { ...TEST_OPTIONS, _fetch: fetchFn });

    const url = new URL(calls[0].url);
    assert.equal(url.searchParams.get('category'), 'text-to-image');
    assert.equal(url.searchParams.get('status'), 'active');
  });

  it('caches results for same filters', async () => {
    const { fetch: fetchFn, calls } = mockFetch([
      {
        status: 200,
        body: {
          data: [{ id: 'model-1', name: 'Model 1', category: 'text-to-image', status: 'active' }],
          has_more: false,
        },
      },
    ]);

    const first = await listModels(undefined, { ...TEST_OPTIONS, _fetch: fetchFn });
    const second = await listModels(undefined, { ...TEST_OPTIONS, _fetch: fetchFn });

    assert.equal(calls.length, 1); // Only one fetch call
    assert.deepEqual(first, second);
  });

  it('throws CONFIG_ERROR on 401', async () => {
    const { fetch: fetchFn } = mockFetch([
      { status: 401, body: { error: 'Unauthorized' } },
    ]);

    await assert.rejects(
      () => listModels(undefined, { ...TEST_OPTIONS, _fetch: fetchFn }),
      (err) => {
        assert.equal(err.code, 'CONFIG_ERROR');
        assert.equal(err.status, 401);
        assert.match(err.message, /Invalid API key/);
        assert.ok(err.details.url, 'error details should include URL');
        assert.equal(err.details.status, 401);
        return true;
      },
    );
  });

  it('throws API_ERROR on 429', async () => {
    const { fetch: fetchFn } = mockFetch([
      { status: 429, body: { error: 'Too many requests' } },
    ]);

    await assert.rejects(
      () => listModels(undefined, { ...TEST_OPTIONS, _fetch: fetchFn }),
      (err) => {
        assert.equal(err.code, 'API_ERROR');
        assert.equal(err.status, 429);
        assert.match(err.message, /Rate limited/);
        assert.match(err.message, /try again/i);
        assert.ok(err.details.url, 'error details should include URL');
        assert.equal(err.details.status, 429);
        return true;
      },
    );
  });

  it('throws NETWORK_ERROR on fetch failure', async () => {
    const { fetch: fetchFn } = mockFetch([
      { error: 'getaddrinfo ENOTFOUND api.fal.ai' },
    ]);

    await assert.rejects(
      () => listModels(undefined, { ...TEST_OPTIONS, _fetch: fetchFn }),
      (err) => {
        assert.equal(err.code, 'NETWORK_ERROR');
        assert.match(err.message, /Failed to connect/);
        assert.ok(err.details.url, 'error details should include URL');
        return true;
      },
    );
  });

  it('throws API_ERROR on 500 server error', async () => {
    const { fetch: fetchFn } = mockFetch([
      { status: 500, body: { error: 'Internal Server Error' } },
    ]);

    await assert.rejects(
      () => listModels(undefined, { ...TEST_OPTIONS, _fetch: fetchFn }),
      (err) => {
        assert.equal(err.code, 'API_ERROR');
        assert.equal(err.status, 500);
        assert.match(err.message, /500/);
        assert.ok(err.details.url, 'error details should include URL');
        assert.equal(err.details.status, 500);
        return true;
      },
    );
  });
});

describe('listCategories', () => {
  beforeEach(() => {
    clearCache();
  });

  it('returns unique sorted categories', async () => {
    const { fetch: fetchFn } = mockFetch([
      {
        status: 200,
        body: {
          data: [
            { id: 'm1', name: 'M1', category: 'text-to-image', status: 'active' },
            { id: 'm2', name: 'M2', category: 'image-to-image', status: 'active' },
            { id: 'm3', name: 'M3', category: 'text-to-image', status: 'active' },
            { id: 'm4', name: 'M4', category: 'training', status: 'active' },
          ],
          has_more: false,
        },
      },
    ]);

    const categories = await listCategories({ ...TEST_OPTIONS, _fetch: fetchFn });

    assert.deepEqual(categories, ['image-to-image', 'text-to-image', 'training']);
  });
});
