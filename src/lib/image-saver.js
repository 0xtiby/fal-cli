import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Map a content-type header value to a file extension.
 * @param {string|null|undefined} contentType
 * @returns {string}
 */
export function extensionFromContentType(contentType) {
  if (!contentType) return 'png';
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  };
  return map[contentType.split(';')[0].trim()] ?? 'png';
}

/**
 * Derive a short slug from a model ID.
 * Takes the last two path segments, joins with dash.
 * e.g. 'fal-ai/flux/schnell' → 'flux-schnell'
 * @param {string} modelId
 * @returns {string}
 */
function modelSlug(modelId) {
  const parts = modelId.split('/');
  return parts.slice(-2).join('-');
}

/**
 * Generate a filename for a saved image.
 * Format: YYYY-MM-DD_HHmmss_<model-slug>.<ext>
 * @param {string} modelId
 * @param {string} ext
 * @param {Date} [now] - For testing
 * @returns {string}
 */
export function generateFilename(modelId, ext, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}_${time}_${modelSlug(modelId)}.${ext}`;
}

/**
 * Download an image from a URL and save it to disk.
 * Retries once on failure.
 * @param {string} url - CDN URL of the image
 * @param {string} outputDir - Directory to save into
 * @param {string} modelId - Model ID for filename generation
 * @param {{ _fetch?: typeof fetch }} [options]
 * @returns {Promise<string>} Local file path
 */
export async function saveImage(url, outputDir, modelId, options = {}) {
  const fetchFn = options._fetch ?? fetch;

  let res;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetchFn(url);
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        res = null;
        continue;
      }
      break;
    } catch (err) {
      lastError = err;
      res = null;
    }
  }

  if (!res) {
    throw new Error(
      `Failed to download image from ${url}: ${lastError.message}. You can download it manually.`
    );
  }

  const contentType = res.headers.get('content-type');
  const ext = extensionFromContentType(contentType);
  const filename = generateFilename(modelId, ext);
  const filePath = path.join(outputDir, filename);

  await mkdir(outputDir, { recursive: true });

  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(filePath, buffer);

  return filePath;
}
