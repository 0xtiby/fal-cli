import { fal } from '@fal-ai/client';
import { loadConfig } from '../config.js';

/** @typedef {Object} Model
 * @property {string} endpointId - Stable model identifier (e.g. "fal-ai/flux/schnell")
 * @property {string} name - Human-readable display name
 * @property {string} category - Model category (e.g. "text-to-image")
 */

const API_BASE = 'https://api.fal.ai/v1/models';

/** @type {Map<string, Model[]>} In-memory cache keyed by filter string */
const cache = new Map();

/**
 * Build a cache key from filters.
 * @param {Object} [filters]
 * @returns {string}
 */
function cacheKey(filters) {
  return filters?.category ?? '';
}

/**
 * Fetch all models from the fal.ai platform API.
 * Handles pagination automatically. Results are cached in-memory.
 * @param {Object} [filters]
 * @param {string} [filters.category] - Filter by category
 * @param {{ falKey?: string, _fetch?: typeof fetch }} [options] - Internal options for testing
 * @returns {Promise<Model[]>}
 */
export async function listModels(filters, options = {}) {
  const key = cacheKey(filters);
  if (cache.has(key)) {
    return cache.get(key);
  }

  const falKey = options.falKey ?? loadConfig().falKey;
  const fetchFn = options._fetch ?? fetch;

  /** @type {Model[]} */
  const models = [];
  let cursor = undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = new URL(API_BASE);
    url.searchParams.set('status', 'active');
    if (filters?.category) {
      url.searchParams.set('category', filters.category);
    }
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    let res;
    try {
      res = await fetchFn(url.toString(), {
        headers: { Authorization: `Key ${falKey}` },
      });
    } catch (err) {
      throw {
        code: 'NETWORK_ERROR',
        message: `Failed to connect to fal.ai API: ${err.message}`,
        details: { url: url.toString() },
      };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 401) {
        throw {
          code: 'CONFIG_ERROR',
          message: 'Invalid API key. Check your FAL_KEY configuration.',
          status: res.status,
          details: { url: url.toString(), status: res.status, response: body },
        };
      }
      if (res.status === 429) {
        throw {
          code: 'API_ERROR',
          message: 'Rate limited by fal.ai API. Please wait and try again.',
          status: res.status,
          details: { url: url.toString(), status: res.status, response: body },
        };
      }
      throw {
        code: 'API_ERROR',
        message: `fal.ai API returned ${res.status}`,
        status: res.status,
        details: { url: url.toString(), status: res.status, response: body },
      };
    }

    const json = await res.json();
    for (const item of json.data) {
      models.push({
        endpointId: item.id,
        name: item.name,
        category: item.category,
      });
    }

    if (json.has_more && json.next_cursor) {
      cursor = json.next_cursor;
    } else {
      break;
    }
  }

  cache.set(key, models);
  return models;
}

/**
 * Fetch all unique categories from available models.
 * @param {{ falKey?: string, _fetch?: typeof fetch }} [options]
 * @returns {Promise<string[]>}
 */
export async function listCategories(options = {}) {
  const models = await listModels(undefined, options);
  const categories = [...new Set(models.map((m) => m.category))].sort();
  return categories;
}

/**
 * Generate an image using fal.ai's queue-based subscribe API.
 * @param {{ model: string, prompt: string, image_size?: string, seed?: number }} input
 * @param {(status: { status: string, position?: number }) => void} [onStatus]
 * @param {{ _fal?: typeof fal }} [options] - Internal options for testing
 * @returns {Promise<{ url: string, width: number, height: number, seed: number }>}
 */
export async function generateImage(input, onStatus, options = {}) {
  const falClient = options._fal ?? fal;

  const apiInput = { prompt: input.prompt };
  if (input.image_size) {
    apiInput.image_size = input.image_size;
  }
  if (input.seed !== undefined) {
    apiInput.seed = input.seed;
  }

  const result = await falClient.subscribe(input.model, {
    input: apiInput,
    onQueueUpdate: onStatus
      ? (update) => {
          const status = { status: update.status };
          if (update.queue_position !== undefined) {
            status.position = update.queue_position;
          }
          onStatus(status);
        }
      : undefined,
  });

  const image = result.data.images[0];
  return {
    url: image.url,
    width: image.width,
    height: image.height,
    seed: result.data.seed,
  };
}

/**
 * Clear the in-memory model cache. Useful for testing.
 */
export function clearCache() {
  cache.clear();
}
