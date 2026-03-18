import { fal } from '@fal-ai/client';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { buffer as consumeStream } from 'node:stream/consumers';
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
    for (const item of json.models) {
      models.push({
        endpointId: item.endpoint_id,
        name: item.metadata?.display_name ?? item.endpoint_id,
        category: item.metadata?.category ?? 'unknown',
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

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

function parseDataUri(dataUri) {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid data URI format');
  return { buffer: Buffer.from(match[2], 'base64'), contentType: match[1] };
}

function readStdin(options = {}) {
  return consumeStream(options._stdin ?? process.stdin);
}

function uploadBuffer(falClient, buffer, contentType = 'application/octet-stream') {
  return falClient.storage.upload(new Blob([buffer], { type: contentType }));
}

/**
 * Resolve an image source to a URL. Accepts HTTP/HTTPS URLs (returned as-is),
 * data URIs (decoded and uploaded), "-" (stdin), or local file paths.
 * @param {string} source - URL, data URI, "-" for stdin, or local file path
 * @param {{ _fal?: typeof fal, _stdin?: import('node:stream').Readable }} [options]
 * @returns {Promise<string>} A URL usable by fal.ai models
 */
export async function resolveImageUrl(source, options = {}) {
  const trimmed = source.trim();
  const falClient = options._fal ?? fal;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.startsWith('data:')) {
    const { buffer, contentType } = parseDataUri(trimmed);
    return uploadBuffer(falClient, buffer, contentType);
  }

  if (trimmed === '-') {
    return uploadBuffer(falClient, await readStdin(options));
  }

  // Strip shell escape characters from user-provided paths
  const filePath = resolve(trimmed.replace(/\\(?=[ ()'])/g, ''));
  const ext = extname(filePath).toLowerCase();
  return uploadBuffer(falClient, await readFile(filePath), MIME_TYPES[ext]);
}

/**
 * Generate an image using fal.ai's queue-based subscribe API.
 * @param {{ model: string, prompt: string, image_url?: string, image_urls?: string[], image_size?: string, seed?: number }} input
 * @param {(status: { status: string, position?: number }) => void} [onStatus]
 * @param {{ _fal?: typeof fal }} [options] - Internal options for testing
 * @returns {Promise<{ url: string, width: number, height: number, seed: number }>}
 */
export async function generateImage(input, onStatus, options = {}) {
  const falClient = options._fal ?? fal;

  const apiInput = { prompt: input.prompt };
  if (input.image_urls?.length) {
    apiInput.image_url = input.image_urls[0];
    apiInput.image_urls = input.image_urls;
  } else if (input.image_url) {
    apiInput.image_url = input.image_url;
    apiInput.image_urls = [input.image_url];
  }
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
 * Run a generation request using fal.ai's queue-based subscribe API.
 * Unlike generateImage(), returns the full response data and requestId.
 * @param {{ model: string, prompt: string, image_url?: string, image_urls?: string[], image_size?: string, seed?: number }} input
 * @param {(status: { status: string, position?: number }) => void} [onStatus]
 * @param {{ _fal?: typeof fal }} [options]
 * @returns {Promise<{ data: Object, requestId: string }>}
 */
export async function runGeneration(input, onStatus, options = {}) {
  const falClient = options._fal ?? fal;

  const apiInput = { prompt: input.prompt };
  if (input.image_urls?.length) {
    apiInput.image_url = input.image_urls[0];
    apiInput.image_urls = input.image_urls;
  } else if (input.image_url) {
    apiInput.image_url = input.image_url;
    apiInput.image_urls = [input.image_url];
  }
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

  return { data: result.data, requestId: result.requestId };
}

/**
 * Extract output file URLs from a fal.ai API response.
 * Handles varying response shapes: images[], video, audio, or generic URL fields.
 *
 * Priority order:
 * 1. data.images[] — array of { url, width, height } (image models)
 * 2. data.video — { url, content_type?, file_name?, file_size? } (video models)
 * 3. data.audio — { url, content_type?, file_name?, file_size? } (audio models)
 * 4. Walk the response object and collect any { url: string } values
 *    that match fal.ai CDN patterns (https://fal.media/ or https://v3.fal.media/)
 *
 * @param {Object} data - Raw response data from fal.subscribe()
 * @returns {{ url: string, width?: number, height?: number, contentType?: string }[]}
 */
export function extractOutputFiles(data) {
  const files = [];
  if (!data || typeof data !== 'object') return files;

  if (Array.isArray(data.images) && data.images.length > 0) {
    for (const img of data.images) {
      files.push({
        url: img.url,
        ...(img.width !== undefined && { width: img.width }),
        ...(img.height !== undefined && { height: img.height }),
      });
    }
  }

  if (data.video?.url) {
    files.push({
      url: data.video.url,
      ...(data.video.content_type && { contentType: data.video.content_type }),
      ...(data.video.file_name && { fileName: data.video.file_name }),
      ...(data.video.file_size !== undefined && { fileSize: data.video.file_size }),
    });
  }

  if (data.audio?.url) {
    files.push({
      url: data.audio.url,
      ...(data.audio.content_type && { contentType: data.audio.content_type }),
      ...(data.audio.file_name && { fileName: data.audio.file_name }),
      ...(data.audio.file_size !== undefined && { fileSize: data.audio.file_size }),
    });
  }

  if (files.length > 0) return files;

  // Fallback: walk the response and collect fal.ai CDN URLs
  const cdnPattern = /^https:\/\/(fal\.media|v3\.fal\.media)\//;
  walkObject(data, (value) => {
    if (typeof value?.url === 'string' && cdnPattern.test(value.url)) {
      files.push({ url: value.url });
    }
  });

  return files;
}

/**
 * Recursively walk an object, calling fn on each non-null object value.
 * @param {any} obj
 * @param {(value: any) => void} fn
 */
function walkObject(obj, fn) {
  if (obj === null || typeof obj !== 'object') return;
  fn(obj);
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      walkObject(value, fn);
    }
  }
}

/**
 * Clear the in-memory model cache. Useful for testing.
 */
export function clearCache() {
  cache.clear();
}
