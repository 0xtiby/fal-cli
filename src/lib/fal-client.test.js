import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { listModels, listCategories, clearCache, generateImage, runGeneration, extractOutputFiles } from './fal-client.js';

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
          models: [
            { endpoint_id: 'fal-ai/flux/schnell', metadata: { display_name: 'FLUX.1 Schnell', category: 'text-to-image' } },
            { endpoint_id: 'fal-ai/recraft/v4', metadata: { display_name: 'Recraft V4', category: 'text-to-image' } },
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
          models: [{ endpoint_id: 'model-1', metadata: { display_name: 'Model 1', category: 'text-to-image' } }],
          has_more: true,
          next_cursor: 'cursor-page-2',
        },
      },
      {
        status: 200,
        body: {
          models: [{ endpoint_id: 'model-2', metadata: { display_name: 'Model 2', category: 'image-to-image' } }],
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
        body: { models: [], has_more: false },
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
          models: [{ endpoint_id: 'model-1', metadata: { display_name: 'Model 1', category: 'text-to-image' } }],
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
          models: [
            { endpoint_id: 'm1', metadata: { display_name: 'M1', category: 'text-to-image' } },
            { endpoint_id: 'm2', metadata: { display_name: 'M2', category: 'image-to-image' } },
            { endpoint_id: 'm3', metadata: { display_name: 'M3', category: 'text-to-image' } },
            { endpoint_id: 'm4', metadata: { display_name: 'M4', category: 'training' } },
          ],
          has_more: false,
        },
      },
    ]);

    const categories = await listCategories({ ...TEST_OPTIONS, _fetch: fetchFn });

    assert.deepEqual(categories, ['image-to-image', 'text-to-image', 'training']);
  });
});

/**
 * Create a mock fal client for testing generateImage.
 * @param {{ data: any }} result - The result fal.subscribe resolves to
 * @returns {{ fal: { subscribe: Function }, calls: Array }}
 */
function mockFal(result) {
  const calls = [];
  return {
    fal: {
      subscribe: async (endpointId, options) => {
        calls.push({ endpointId, options });
        if (options.onQueueUpdate) {
          for (const update of result._queueUpdates ?? []) {
            options.onQueueUpdate(update);
          }
        }
        return { data: result.data };
      },
    },
    calls,
  };
}

describe('generateImage', () => {
  it('returns correct shape from mocked fal.subscribe', async () => {
    const { fal: mockClient } = mockFal({
      data: {
        images: [{ url: 'https://fal.ai/img/1.png', width: 1024, height: 768 }],
        seed: 42,
      },
    });

    const result = await generateImage(
      { model: 'fal-ai/flux/schnell', prompt: 'a cat' },
      undefined,
      { _fal: mockClient },
    );

    assert.deepEqual(result, {
      url: 'https://fal.ai/img/1.png',
      width: 1024,
      height: 768,
      seed: 42,
    });
  });

  it('calls onStatus with queue position during IN_QUEUE', async () => {
    const statuses = [];
    const { fal: mockClient } = mockFal({
      _queueUpdates: [
        { status: 'IN_QUEUE', queue_position: 3 },
      ],
      data: {
        images: [{ url: 'https://fal.ai/img/1.png', width: 512, height: 512 }],
        seed: 1,
      },
    });

    await generateImage(
      { model: 'fal-ai/flux/schnell', prompt: 'a cat' },
      (s) => statuses.push(s),
      { _fal: mockClient },
    );

    assert.equal(statuses.length, 1);
    assert.deepEqual(statuses[0], { status: 'IN_QUEUE', position: 3 });
  });

  it('calls onStatus with IN_PROGRESS status', async () => {
    const statuses = [];
    const { fal: mockClient } = mockFal({
      _queueUpdates: [
        { status: 'IN_QUEUE', queue_position: 1 },
        { status: 'IN_PROGRESS' },
      ],
      data: {
        images: [{ url: 'https://fal.ai/img/1.png', width: 512, height: 512 }],
        seed: 1,
      },
    });

    await generateImage(
      { model: 'fal-ai/flux/schnell', prompt: 'a cat' },
      (s) => statuses.push(s),
      { _fal: mockClient },
    );

    assert.equal(statuses.length, 2);
    assert.deepEqual(statuses[1], { status: 'IN_PROGRESS' });
  });

  it('passes seed to API when provided', async () => {
    const { fal: mockClient, calls } = mockFal({
      data: {
        images: [{ url: 'https://fal.ai/img/1.png', width: 512, height: 512 }],
        seed: 99,
      },
    });

    await generateImage(
      { model: 'fal-ai/flux/schnell', prompt: 'a dog', seed: 99 },
      undefined,
      { _fal: mockClient },
    );

    assert.equal(calls[0].options.input.seed, 99);
  });

  it('omits seed from API input when not provided', async () => {
    const { fal: mockClient, calls } = mockFal({
      data: {
        images: [{ url: 'https://fal.ai/img/1.png', width: 512, height: 512 }],
        seed: 42,
      },
    });

    await generateImage(
      { model: 'fal-ai/flux/schnell', prompt: 'a dog' },
      undefined,
      { _fal: mockClient },
    );

    assert.equal('seed' in calls[0].options.input, false);
  });

  it('returns first image only from images[] array', async () => {
    const { fal: mockClient } = mockFal({
      data: {
        images: [
          { url: 'https://fal.ai/img/first.png', width: 1024, height: 1024 },
          { url: 'https://fal.ai/img/second.png', width: 512, height: 512 },
        ],
        seed: 7,
      },
    });

    const result = await generateImage(
      { model: 'fal-ai/flux/schnell', prompt: 'a bird' },
      undefined,
      { _fal: mockClient },
    );

    assert.equal(result.url, 'https://fal.ai/img/first.png');
    assert.equal(result.width, 1024);
    assert.equal(result.height, 1024);
  });
});

/**
 * Create a mock fal client for runGeneration tests (includes requestId).
 */
function mockFalWithRequestId(result) {
  const calls = [];
  return {
    fal: {
      subscribe: async (endpointId, options) => {
        calls.push({ endpointId, options });
        if (options.onQueueUpdate) {
          for (const update of result._queueUpdates ?? []) {
            options.onQueueUpdate(update);
          }
        }
        return { data: result.data, requestId: result.requestId ?? 'req-abc123' };
      },
    },
    calls,
  };
}

describe('runGeneration', () => {
  it('returns { data, requestId } from mocked fal.subscribe', async () => {
    const { fal: mockClient } = mockFalWithRequestId({
      data: { images: [{ url: 'https://fal.ai/img/1.png', width: 1024, height: 768 }], seed: 42 },
      requestId: 'req-xyz789',
    });

    const result = await runGeneration(
      { model: 'fal-ai/flux/schnell', prompt: 'a cat' },
      undefined,
      { _fal: mockClient },
    );

    assert.deepEqual(result.data, {
      images: [{ url: 'https://fal.ai/img/1.png', width: 1024, height: 768 }],
      seed: 42,
    });
    assert.equal(result.requestId, 'req-xyz789');
  });

  it('passes input fields correctly to fal.subscribe', async () => {
    const { fal: mockClient, calls } = mockFalWithRequestId({
      data: { images: [{ url: 'https://fal.ai/img/1.png', width: 512, height: 512 }] },
    });

    await runGeneration(
      { model: 'fal-ai/flux/schnell', prompt: 'a dog', image_size: 'landscape_16_9', seed: 42 },
      undefined,
      { _fal: mockClient },
    );

    assert.equal(calls[0].endpointId, 'fal-ai/flux/schnell');
    assert.equal(calls[0].options.input.prompt, 'a dog');
    assert.equal(calls[0].options.input.image_size, 'landscape_16_9');
    assert.equal(calls[0].options.input.seed, 42);
  });

  it('forwards onStatus callbacks', async () => {
    const statuses = [];
    const { fal: mockClient } = mockFalWithRequestId({
      _queueUpdates: [
        { status: 'IN_QUEUE', queue_position: 2 },
        { status: 'IN_PROGRESS' },
      ],
      data: { images: [{ url: 'https://fal.ai/img/1.png', width: 512, height: 512 }] },
    });

    await runGeneration(
      { model: 'fal-ai/flux/schnell', prompt: 'test' },
      (s) => statuses.push(s),
      { _fal: mockClient },
    );

    assert.equal(statuses.length, 2);
    assert.deepEqual(statuses[0], { status: 'IN_QUEUE', position: 2 });
    assert.deepEqual(statuses[1], { status: 'IN_PROGRESS' });
  });
});

describe('extractOutputFiles', () => {
  it('extracts images from data.images[]', () => {
    const files = extractOutputFiles({
      images: [
        { url: 'https://fal.ai/img/1.png', width: 1024, height: 768 },
        { url: 'https://fal.ai/img/2.png', width: 512, height: 512 },
      ],
    });

    assert.equal(files.length, 2);
    assert.deepEqual(files[0], { url: 'https://fal.ai/img/1.png', width: 1024, height: 768 });
    assert.deepEqual(files[1], { url: 'https://fal.ai/img/2.png', width: 512, height: 512 });
  });

  it('extracts video from data.video', () => {
    const files = extractOutputFiles({
      video: { url: 'https://fal.ai/vid/out.mp4', content_type: 'video/mp4' },
    });

    assert.equal(files.length, 1);
    assert.deepEqual(files[0], { url: 'https://fal.ai/vid/out.mp4', contentType: 'video/mp4' });
  });

  it('extracts audio from data.audio', () => {
    const files = extractOutputFiles({
      audio: { url: 'https://fal.ai/aud/out.mp3', content_type: 'audio/mpeg' },
    });

    assert.equal(files.length, 1);
    assert.deepEqual(files[0], { url: 'https://fal.ai/aud/out.mp3', contentType: 'audio/mpeg' });
  });

  it('extracts both images and video when present', () => {
    const files = extractOutputFiles({
      images: [{ url: 'https://fal.ai/img/1.png', width: 512, height: 512 }],
      video: { url: 'https://fal.ai/vid/out.mp4' },
    });

    assert.equal(files.length, 2);
    assert.equal(files[0].url, 'https://fal.ai/img/1.png');
    assert.equal(files[1].url, 'https://fal.ai/vid/out.mp4');
  });

  it('returns empty array for empty data', () => {
    const files = extractOutputFiles({});
    assert.deepEqual(files, []);
  });

  it('falls back to walking object for fal.media CDN URLs', () => {
    const files = extractOutputFiles({
      result: {
        output: { url: 'https://fal.media/files/abc/def.png' },
      },
    });

    assert.equal(files.length, 1);
    assert.equal(files[0].url, 'https://fal.media/files/abc/def.png');
  });

  it('falls back to walking object for v3.fal.media CDN URLs', () => {
    const files = extractOutputFiles({
      nested: { deep: { url: 'https://v3.fal.media/files/xyz/out.mp4' } },
    });

    assert.equal(files.length, 1);
    assert.equal(files[0].url, 'https://v3.fal.media/files/xyz/out.mp4');
  });

  it('ignores non-CDN URLs in fallback walk', () => {
    const files = extractOutputFiles({
      link: { url: 'https://example.com/not-cdn.png' },
    });

    assert.deepEqual(files, []);
  });
});
