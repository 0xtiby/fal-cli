# 06 — Generate Command (Agent-Friendly)

Non-interactive generation command that exposes all interactive-mode capabilities as CLI flags, designed for AI agent consumption.

## Overview

The `generate` command sends a prompt (and optionally reference images) to any fal.ai model, waits for the result with a progress spinner, downloads all output files to disk, and returns structured results. Supports any output type the model produces — images, video, audio, or structured data.

This is the non-interactive counterpart to `fal-cli interactive`. Where interactive mode guides the user through prompts, `generate` takes everything as flags so AI agents and scripts can use it directly.

## Users & Problem

- **Primary user:** AI coding agents that need to generate media programmatically
- **Secondary user:** Developers scripting generation in CI/CD or shell scripts
- **Problem:** The interactive command requires human input at every step — agents can't use it. A flag-based command lets agents call `fal-cli generate --model X --prompt Y --json` and get structured output.

## Scope

**In scope:**
- All fal.ai model output types (images, video, audio, structured data)
- Text-to-X generation via `--prompt`
- Image-to-X workflows via `--image` (local paths or URLs, multi-image support)
- Image size selection via `--size` preset
- Reproducible generation via `--seed`
- Download and save ALL output files to disk
- JSON output with file paths for agent consumption
- Override model, output dir, and size via flags
- Progress spinner with queue position (human mode)
- SIGINT handling — clean spinner teardown on Ctrl+C during generation

**Out of scope:**
- Batch prompts (multiple prompts in one invocation)
- Inpainting / masking
- LoRA or custom model-specific parameters (future: `--param key=value`)
- Streaming partial results

## User Stories

1. **As an AI agent**, I can run `fal-cli generate --model fal-ai/flux/schnell --prompt "a sunset" --json` so that I get a JSON response with the local file path
2. **As an AI agent**, I can run `fal-cli generate --model fal-ai/flux/dev --prompt "make it cyberpunk" --image ./photo.jpg --json` so that I can do image-to-image editing
3. **As an AI agent**, I can pass multiple reference images via `--image ./a.jpg --image ./b.jpg` or `--image ./a.jpg,./b.jpg` so that models requiring multiple inputs work correctly
4. **As a developer**, I can run `fal-cli generate --model fal-ai/minimax-video/image-to-video --prompt "camera pan left" --image ./frame.jpg` so that I generate a video from an image
5. **As a developer**, I can run `fal-cli generate --model X --prompt Y --seed 42` so that I get reproducible results
6. **As a developer**, I can run `fal-cli generate --model X --prompt Y --output ./my-dir` so that files are saved where I want them

## Business Rules

- `--model` is **required**. Defined as `z.string()` (not `.optional()`) so incur's built-in validation rejects missing values with a `ValidationError`. No custom validation needed.
- `--prompt` is **required**. Same as `--model` — incur validates via Zod schema.
- `--size` defaults to `FAL_IMAGE_SIZE` from config (fallback: `landscape_4_3`). Only relevant for models that accept `image_size`.
- `--output` defaults to `FAL_OUTPUT_DIR` from config (fallback: `./generated`).
- `--seed` is optional. If omitted, the API picks a random seed. The seed used is always included in the output.
- `--image` accepts local file paths or URLs. Local files are uploaded to fal.ai storage before the request.
- `--image` supports two forms:
  - **Repeated flags** (handled natively by incur's array accumulation): `--image a.jpg --image b.jpg`
  - **Comma-separated** (split manually in the command handler after incur parses): `--image a.jpg,b.jpg`
  - Both forms can be mixed: `--image a.jpg,b.jpg --image c.jpg` → `["a.jpg", "b.jpg", "c.jpg"]`
  - The handler must flatMap the parsed array, splitting each entry on commas.
- `--category` is optional. When provided, it is included in the JSON output for documentation purposes but does not change behavior.
- The CLI uses `fal.subscribe()` to submit the request and poll for results with status updates.
- **All** output files from the response are downloaded and saved — not just the first.
- The output directory is created automatically if it doesn't exist.
- Files are named with the existing pattern: `YYYY-MM-DD_HHmmss_<model-slug>.<ext>`. When multiple files are saved, a numeric suffix is appended: `_001`, `_002`, etc.
- File extension is derived from the CDN response `content-type` header. Falls back to appropriate defaults per media type.
- The fal.ai response shape varies by model. Common patterns:
  - `{ images: [{ url, width, height }], seed }` — image models
  - `{ video: { url, content_type?, file_name?, file_size? } }` — video models
  - `{ audio: { url, content_type?, file_name?, file_size? } }` — audio models
  - Other shapes — walk the response object and collect any `{ url: string }` values that look like fal.ai CDN URLs
- The command must normalize all these into a consistent `files[]` array.
- The command handler returns the `GenerateResult` object. Incur's built-in `--json` flag auto-serializes it — no manual `JSON.stringify` needed. In human mode, the handler prints formatted output to stdout before returning.

## UI/UX

### Standard output (human mode)

```
⠋ Queued (position 3)...
⠙ Generating...
✓ Saved 1 file to ./generated/

  Model:     fal-ai/flux/schnell
  Seed:      42981337
  RequestId: abc123-def456
  Files:
    ./generated/2026-03-18_143022_flux-schnell.png (1024×768)
```

### Verbose output (`--verbose`)

Verbose mode shows the full API request and response for debugging:

```
⠋ Queued (position 3)...
⠙ Generating...
✓ Saved 1 file to ./generated/

  Model:     fal-ai/flux/schnell
  Seed:      42981337
  RequestId: abc123-def456
  Files:
    ./generated/2026-03-18_143022_flux-schnell.png (1024×768)

  [verbose] Request:
    Endpoint: fal-ai/flux/schnell
    Input: { "prompt": "a sunset", "image_size": "landscape_4_3" }

  [verbose] Response:
    { "images": [{ "url": "https://...", "width": 1024, "height": 768 }], "seed": 42981337 }
```

### Multi-file output

```
✓ Saved 3 files to ./generated/

  Model:     fal-ai/flux/schnell
  Seed:      42981337
  RequestId: abc123-def456
  Files:
    ./generated/2026-03-18_143022_flux-schnell_001.png (1024×768)
    ./generated/2026-03-18_143022_flux-schnell_002.png (1024×768)
    ./generated/2026-03-18_143022_flux-schnell_003.png (512×512)
```

### JSON output (`--json`)

Incur auto-serializes the returned `GenerateResult` object. The command handler returns it directly.

```json
{
  "model": "fal-ai/flux/schnell",
  "seed": 42981337,
  "requestId": "abc123-def456",
  "files": [
    {
      "url": "https://fal.media/files/abc123.png",
      "localPath": "./generated/2026-03-18_143022_flux-schnell.png",
      "contentType": "image/png",
      "width": 1024,
      "height": 768
    }
  ]
}
```

For non-image outputs (video, audio), `width` and `height` are omitted:

```json
{
  "model": "fal-ai/minimax-video/image-to-video",
  "seed": 12345,
  "requestId": "xyz789",
  "files": [
    {
      "url": "https://fal.media/files/xyz.mp4",
      "localPath": "./generated/2026-03-18_150101_minimax-video-image-to-video.mp4",
      "contentType": "video/mp4"
    }
  ]
}
```

### Error output

Incur's `ValidationError` handles missing required flags automatically:

```
✗ ValidationError: Required (model)
```

Application-level errors use the existing `handleError` / `withErrorHandling` pattern:

```
✗ Error: File not found: ./photo.jpg
```

### States

- **Queued:** Spinner with queue position
- **In progress:** Spinner with "Generating..."
- **Success:** Checkmark + saved paths + metadata
- **SIGINT during generation:** Spinner stops cleanly, process exits 0 (same pattern as interactive command)
- **Error:** Red X + error message + exit code

## Data Model

```js
/** @typedef {Object} GenerateInput
 * @property {string} model - Model endpoint ID (required)
 * @property {string} prompt - Text prompt (required)
 * @property {string[]} [images] - Reference images (local paths or URLs)
 * @property {string} [size] - Image size preset
 * @property {string} [outputDir] - Directory to save output files
 * @property {number} [seed] - Seed for reproducible generation
 * @property {string} [category] - Category hint (informational)
 */

/** @typedef {Object} GenerateOutputFile
 * @property {string} url - CDN URL of the output file
 * @property {string} localPath - Local file path where file was saved
 * @property {string} contentType - MIME type of the file
 * @property {number} [width] - Width in pixels (images only)
 * @property {number} [height] - Height in pixels (images only)
 */

/** @typedef {Object} GenerateResult
 * @property {string} model - Model endpoint ID used
 * @property {number} [seed] - Seed used for generation (if returned by model)
 * @property {string} requestId - Unique request ID from fal.ai (from fal.subscribe().requestId)
 * @property {GenerateOutputFile[]} files - All output files saved to disk
 */
```

## API / Interface

```js
// src/commands/generate.js — incur command definition

// options: {
//   model:    z.string().describe('Model endpoint ID'),
//   prompt:   z.string().describe('Text prompt for generation'),
//   image:    z.array(z.string()).optional().describe('Reference image path(s) or URL(s)'),
//   size:     z.enum(IMAGE_SIZE_PRESETS).optional().describe('Image size preset'),
//   output:   z.string().optional().describe('Output directory'),
//   seed:     z.number().optional().describe('Seed for reproducible generation'),
//   category: z.string().optional().describe('Category hint (informational)'),
// }
// returns: GenerateResult (incur auto-serializes to JSON when --json is passed)
```

```js
// src/lib/fal-client.js — new function (does NOT modify existing generateImage)

/**
 * Execute a generation request and return the full response with all outputs.
 * Unlike generateImage() which returns only the first image, this returns
 * the raw response data + requestId for the generate command to normalize.
 *
 * @param {{ model: string, prompt: string, image_url?: string, image_urls?: string[], image_size?: string, seed?: number }} input
 * @param {(status: { status: string, position?: number }) => void} [onStatus]
 * @param {{ _fal?: typeof fal }} [options]
 * @returns {Promise<{ data: Object, requestId: string }>}
 */
export async function runGeneration(input, onStatus, options = {}) {}

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
export function extractOutputFiles(data) {}
```

```js
// src/lib/file-saver.js — NEW file (replaces image-only saving)
// The existing saveImage() in image-saver.js is NOT modified — interactive command still uses it.

/**
 * Extended content-type to extension mapping.
 * Supports image/*, video/*, audio/* types.
 */
const EXTENSION_MAP = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'application/json': 'json',
};

/**
 * Save a file (image, video, audio, etc.) from a URL to disk.
 * Handles any content type, not just images.
 *
 * @param {string} url - CDN URL
 * @param {string} outputDir - Target directory
 * @param {string} modelId - Model ID for filename
 * @param {{ suffix?: string, _fetch?: typeof fetch }} [options] - suffix for multi-file naming (_001, _002)
 * @returns {Promise<{ localPath: string, contentType: string }>}
 */
export async function saveFile(url, outputDir, modelId, options = {}) {}

/**
 * Generate a filename, optionally with a numeric suffix for multi-file output.
 * Format: YYYY-MM-DD_HHmmss_<model-slug>[_NNN].<ext>
 *
 * @param {string} modelId
 * @param {string} ext
 * @param {{ suffix?: string, now?: Date }} [options]
 * @returns {string}
 */
export function generateFilename(modelId, ext, options = {}) {}
```

## Architecture

```
fal-cli generate --model fal-ai/flux/schnell --prompt "sunset" --image ./photo.jpg
  │
  ├─ Parse flags (incur)
  │    └─ Zod validates: --model and --prompt required, --size enum check
  │       (ValidationError on missing/invalid → incur handles error display)
  │
  ├─ resolveConfig(config, flags) — merge defaults with overrides
  │
  ├─ Flatten --image array (comma-split each entry, then flatMap)
  │    e.g. ["a.jpg,b.jpg", "c.jpg"] → ["a.jpg", "b.jpg", "c.jpg"]
  │
  ├─ For each image source:
  │    ├─ Is it a URL? → use as-is
  │    └─ Is it a local path? → resolveImageUrl() → upload to fal storage
  │
  ├─ Register SIGINT handler → stop spinner, exit 0
  │
  ├─ runGeneration(input, onStatus) → { data, requestId }
  │    └─ fal.subscribe(model, { input, onQueueUpdate })
  │        └─ onQueueUpdate → spinner text updates
  │
  ├─ Remove SIGINT handler
  │
  ├─ extractOutputFiles(data) → [{ url, width?, height?, contentType? }]
  │    ├─ Check data.images[] first
  │    ├─ Then data.video
  │    ├─ Then data.audio
  │    └─ Fallback: walk object for CDN URLs
  │
  ├─ For each output file (with index):
  │    ├─ suffix = files.length > 1 ? `_${String(i+1).padStart(3, '0')}` : undefined
  │    └─ saveFile(url, outputDir, model, { suffix }) → { localPath, contentType }
  │
  ├─ Build GenerateResult { model, seed: data.seed, requestId, files[] }
  │
  ├─ Human mode: print formatted summary to stdout
  │    Verbose mode: also print request input and raw response data
  │
  └─ Return GenerateResult (incur auto-serializes for --json)
```

### Response normalization

The `extractOutputFiles` function handles varying fal.ai response shapes:

```js
// Priority order for extracting output URLs:
// 1. data.images[] — most common (image models)
//    Each entry has: { url: string, width: number, height: number }
//
// 2. data.video — video models
//    Shape: { url: string, content_type?: string, file_name?: string, file_size?: number }
//
// 3. data.audio — audio models
//    Shape: { url: string, content_type?: string, file_name?: string, file_size?: number }
//
// 4. Fallback: recursively walk the response object and collect any
//    { url: string } values where url matches fal.ai CDN patterns
//    (https://fal.media/* or https://v3.fal.media/*)
//    Skip known non-output URLs (e.g. input image URLs echoed back)
```

### Relationship to existing code

- **`generateImage()` in fal-client.js is NOT modified.** The interactive command continues to use it as-is (returns first image only). The new `runGeneration()` function wraps `fal.subscribe()` and returns the full `{ data, requestId }` for the generate command to normalize.
- **`saveImage()` in image-saver.js is NOT modified.** The interactive command continues to use it. A new `file-saver.js` module provides `saveFile()` which handles any content type.
- **`resolveImageUrl()` is reused as-is** — it already handles both URLs and local file uploads.
- **`resolveConfig()` is reused as-is** — it merges config defaults with flag overrides.
- **`withErrorHandling()` wraps the command handler** — same pattern as models and interactive commands.

## Edge Cases

- **Missing --model:** Incur throws `ValidationError` with field details. Exit code 1.
- **Missing --prompt:** Same — incur `ValidationError`. Exit code 1.
- **Local image file not found:** `resolveImageUrl()` throws on `readFile()` — caught by `withErrorHandling`, shows path in error message.
- **Image upload failure:** `fal.storage.upload()` error — caught and displayed.
- **Model doesn't support image input:** API returns error — display clearly.
- **CDN download failure:** `saveFile()` retries once per file, then errors with CDN URL for manual download.
- **Output directory not writable:** Exit with permission error.
- **Unknown response shape:** If `extractOutputFiles` finds no URLs, exit with error. In verbose mode, print the raw response data so the user can see what the model returned.
- **Multiple --image parsing:** Incur accumulates repeated `--image` flags into an array. The handler then flatMaps with comma-splitting: `["a.jpg,b.jpg", "c.jpg"]` → `["a.jpg", "b.jpg", "c.jpg"]`.
- **Invalid --size value:** Incur's Zod enum validation rejects it with allowed values in the error.
- **API timeout:** Rely on `fal.subscribe`'s built-in timeout, show timeout error with retry suggestion.
- **Multi-file naming:** When response contains N > 1 files, suffix each with `_001`, `_002`, etc. Single file gets no suffix.
- **SIGINT during generation:** Register a SIGINT handler before calling `runGeneration()` that stops the spinner and exits cleanly (code 0). Remove the handler after generation completes. Same pattern as interactive command.
- **Seed not returned:** Some models may not return a seed. The `seed` field in `GenerateResult` is optional — omit it from output if not present in the API response.

## Acceptance Criteria

- **Given** `--model` and `--prompt`, **when** running `fal-cli generate --model fal-ai/flux/schnell --prompt "a cat"`, **then** the image is generated and saved to disk
- **Given** `--json` flag, **when** generating, **then** incur auto-serializes the returned `GenerateResult` as valid JSON with a `files[]` array and `requestId`
- **Given** `--image ./photo.jpg` with a valid file, **when** generating, **then** the file is uploaded via `resolveImageUrl()` and used as reference
- **Given** `--image https://example.com/img.jpg`, **when** generating, **then** the URL is passed directly
- **Given** `--image a.jpg --image b.jpg`, **when** generating, **then** both images are resolved and sent (incur array accumulation)
- **Given** `--image a.jpg,b.jpg`, **when** generating, **then** both images are resolved and sent (comma-split in handler)
- **Given** a model returning multiple outputs, **when** generating, **then** ALL files are saved with `_001`, `_002` suffixes
- **Given** a video model, **when** generating, **then** the video file is downloaded and saved with correct extension (e.g. `.mp4`)
- **Given** missing `--model`, **when** running generate, **then** incur throws `ValidationError` and exits code 1
- **Given** missing `--prompt`, **when** running generate, **then** incur throws `ValidationError` and exits code 1
- **Given** `--seed 42`, **when** generating, **then** the seed is sent to the API and included in the result
- **Given** `--output ./custom`, **when** generating, **then** files are saved to `./custom/`
- **Given** generation in progress, **when** the model is queued, **then** a spinner shows queue position
- **Given** Ctrl+C during generation, **when** SIGINT is received, **then** spinner stops and process exits 0
- **Given** `--verbose`, **when** generating, **then** the full API request input and raw response data are printed after the summary

## Testing Strategy

- Unit test `extractOutputFiles()` with various response shapes:
  - `{ images: [...] }` — single and multiple images
  - `{ video: { url } }` — video with optional metadata fields
  - `{ audio: { url } }` — audio
  - `{ images: [...], video: { url } }` — mixed (should extract all)
  - `{}` — empty response (should return empty array)
  - Nested objects with CDN URLs (fallback extraction)
- Unit test `saveFile()` with mocked fetch for different content types (image/png, video/mp4, audio/wav)
- Unit test `generateFilename()` with and without suffix
- Unit test comma-splitting logic: `["a,b", "c"]` → `["a", "b", "c"]`
- Unit test `runGeneration()` with mocked fal client — verify it returns `{ data, requestId }`
- Unit test error cases: missing flags (incur validation), file not found, API errors
- Unit test SIGINT handler registration and cleanup
- Integration test: full generate flow with mocked fal client (subscribe → extract → save → return result)
- Integration test: verify `--json` output shape matches `GenerateResult` typedef
