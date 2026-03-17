# 03 — Image Generation & Editing

Generate images from text prompts and edit images using reference images, with automatic download to disk.

## Overview

The `generate` command sends a prompt (and optionally a reference image) to a fal.ai model, waits for the result with a progress spinner, downloads the generated image to disk, and returns the result. Supports both text-to-image and image-to-image workflows.

## Users & Problem

- **Primary user:** Developer generating images for projects, prototypes, or creative work
- **AI agent user:** Needs to generate images programmatically and know where they're saved
- **Problem:** Generating images via API requires writing code — a CLI makes it a one-liner

## Scope

**In scope:**
- Text-to-image generation via any fal.ai model
- Image-to-image editing with a reference image (local path or URL)
- Image size selection via presets
- Automatic download and save to disk
- Progress spinner with queue position and status
- JSON output for agents
- Override model, output dir, and size via flags

**Out of scope:**
- Batch generation (multiple images per prompt)
- Inpainting / masking
- Video generation
- LoRA or custom model parameters
- Image upscaling

## User Stories

1. **As a developer**, I can run `fal-cli generate --prompt "a sunset over mountains"` so that an image is generated and saved to disk
2. **As a developer**, I can run `fal-cli generate --prompt "make it cyberpunk" --image ./photo.jpg` so that my photo is edited using AI
3. **As a developer**, I can run `fal-cli generate --prompt "..." --image https://example.com/img.jpg` so that I can use a remote image as reference
4. **As a developer**, I can run `fal-cli generate --prompt "..." --model fal-ai/flux/dev` so that I use a specific model
5. **As a developer**, I can run `fal-cli generate --prompt "..." --size portrait_16_9` so that I control the output dimensions
6. **As an AI agent**, I can run `fal-cli generate --prompt "..." --json` so that I get structured output with the file path

## Business Rules

- `--prompt` is required. Exit with error if missing.
- `--model` defaults to `FAL_DEFAULT_MODEL` from config (fallback: `fal-ai/flux/schnell`)
- `--size` defaults to `FAL_IMAGE_SIZE` from config (fallback: `landscape_4_3`)
- `--output` defaults to `FAL_OUTPUT_DIR` from config (fallback: `./generated`)
- `--seed` optionally accepts a numeric seed for reproducible generation. If omitted, the API picks a random seed. The seed used is always included in the output.
- When `--image` is a local file path, upload it to fal.ai's storage before sending the request (use `fal.storage.upload()`)
- When `--image` is a URL, pass it directly to the model input
- The CLI uses `fal.subscribe()` to submit the request and poll for results with status updates
- Generated images are downloaded from the CDN URL and saved with a timestamp-based filename
- Filename format: `YYYY-MM-DD_HHmmss_<model-slug>.<ext>` (e.g. `2026-03-17_143022_flux-schnell.png`)
- File extension is determined from the CDN response `content-type` header: `image/png` → `.png`, `image/jpeg` → `.jpg`, `image/webp` → `.webp`. Falls back to `.png` if content-type is missing or unrecognized.
- If the API response contains multiple images in the `images[]` array, only the **first image** is saved. This is a deliberate simplification — batch generation is out of scope.
- The output directory is created automatically if it doesn't exist

## UI/UX

### Standard output

```
⠋ Queued (position 3)...
⠙ Generating...
✓ Image saved to ./generated/2026-03-17_143022_flux-schnell.png

  Model:  fal-ai/flux/schnell
  Size:   1024x768
  Seed:   42981337
  Path:   ./generated/2026-03-17_143022_flux-schnell.png
```

### JSON output (`--json`)

```json
{
  "url": "https://fal.media/files/abc123.png",
  "localPath": "./generated/2026-03-17_143022_flux-schnell.png",
  "model": "fal-ai/flux/schnell",
  "width": 1024,
  "height": 768,
  "seed": 42981337
}
```

### Error output

```
✗ Error: Missing --prompt flag. Usage: fal-cli generate --prompt "your prompt here"
```

```
✗ Error: File not found: ./photo.jpg
```

### States

- **Queued:** Spinner with queue position
- **In progress:** Spinner with "Generating..."
- **Success:** Checkmark + saved path + metadata
- **Error:** Red X + error message

## Data Model

```js
/** @typedef {Object} GenerateInput
 * @property {string} prompt - Text prompt for generation
 * @property {string} model - Model endpoint ID
 * @property {string} [image] - Reference image (local path or URL) for image-to-image
 * @property {string} size - Image size preset name
 * @property {string} outputDir - Directory to save the image
 * @property {number} [seed] - Seed for reproducible generation
 */

/** @typedef {Object} GenerateResult
 * @property {string} url - CDN URL of the generated image
 * @property {string} localPath - Local file path where image was saved
 * @property {string} model - Model endpoint ID used
 * @property {number} width - Image width in pixels
 * @property {number} height - Image height in pixels
 * @property {number} seed - Seed used for generation
 */
```

## API / Interface

```js
// src/commands/generate.js — incur command definition

// args: (none)
// options: {
//   prompt:  z.string().describe('Text prompt for image generation'),
//   model:   z.string().optional().describe('Model endpoint ID'),
//   image:   z.string().optional().describe('Reference image path or URL'),
//   size:    z.enum(IMAGE_SIZE_PRESETS).optional().describe('Image size preset'),
//   output:  z.string().optional().describe('Output directory'),
//   seed:    z.number().optional().describe('Seed for reproducible generation'),
// }
// returns: GenerateResult
```

```js
// src/lib/fal-client.js

/**
 * Generate an image using fal.ai.
 * Handles file upload for local reference images.
 * Uses fal.subscribe() for queue-based generation with status updates.
 *
 * @param {GenerateInput} input
 * @param {(status: { status: string, position?: number }) => void} onStatus - Progress callback
 * @returns {Promise<{ url: string, width: number, height: number, seed: number }>}
 */
export async function generateImage(input, onStatus) {}
```

```js
// src/lib/image-saver.js

/**
 * Download an image from a URL and save it to disk.
 * Creates the output directory if it doesn't exist.
 *
 * @param {string} imageUrl - CDN URL of the generated image
 * @param {string} outputDir - Target directory
 * @param {string} model - Model ID (used in filename)
 * @returns {Promise<string>} Local file path where image was saved
 */
export async function saveImage(imageUrl, outputDir, model) {}

/**
 * Generate a timestamp-based filename.
 * Format: YYYY-MM-DD_HHmmss_<model-slug>.<ext>
 *
 * @param {string} model - Model endpoint ID
 * @param {string} ext - File extension (default: "png")
 * @returns {string}
 */
export function generateFilename(model, ext = 'png') {}

/**
 * Determine file extension from a content-type header value.
 * Falls back to "png" for unknown or missing types.
 *
 * @param {string|null} contentType - Content-Type header value
 * @returns {string} File extension without dot (e.g. "png", "jpg", "webp")
 */
export function extensionFromContentType(contentType) {}
```

## Architecture

```
fal-cli generate --prompt "sunset" --image ./photo.jpg
  │
  ├─ Parse options (incur)
  ├─ resolveConfig(config, flags)
  ├─ Is --image a local path?
  │    ├─ Yes → fal.storage.upload(filePath) → get URL
  │    └─ No (URL) → use as-is
  ├─ generateImage({ prompt, model, image, size }, onStatus)
  │    └─ fal.subscribe(model, { input: { prompt, image_url, image_size }, onQueueUpdate })
  ├─ saveImage(result.url, outputDir, model)
  │    ├─ mkdir -p outputDir
  │    ├─ fetch(result.url) → buffer
  │    └─ write to disk with timestamp filename
  └─ Return GenerateResult
```

### fal.ai API mapping

- **Text-to-image:** `fal.subscribe(model, { input: { prompt, image_size, seed } })`
- **Image-to-image:** `fal.subscribe(model, { input: { prompt, image_url, image_size, seed } })`
- **Response shape:** `{ images: [{ url, width, height }], seed }`

## Edge Cases

- **Local image file not found:** Exit with error showing the path and suggesting to check it
- **Local image too large:** fal.ai storage has upload limits — catch and display a helpful error
- **Model doesn't support image input:** API will return an error — display it clearly
- **CDN download failure:** Retry once, then error with the CDN URL so user can download manually
- **Output directory not writable:** Exit with permission error
- **Disk full:** Catch write error and display remaining space info
- **Invalid size preset:** Show allowed values from `IMAGE_SIZE_PRESETS`
- **API timeout:** `fal.subscribe` handles retries — but if it ultimately fails, show timeout error with suggestion to try again. The CLI does not impose its own timeout — it relies on fal.subscribe's built-in timeout behavior.
- **Multiple images in response:** Only the first image from `images[]` is used. Log a verbose message noting additional images were ignored.

## Acceptance Criteria

- **Given** a valid prompt and API key, **when** running `fal-cli generate --prompt "a cat"`, **then** an image is generated and saved to `./generated/` with a timestamp filename
- **Given** `--image ./photo.jpg` with a valid local file, **when** generating, **then** the file is uploaded to fal storage and used as reference
- **Given** `--image https://example.com/img.jpg`, **when** generating, **then** the URL is passed directly to the model
- **Given** `--model fal-ai/flux/dev`, **when** generating, **then** that model is used instead of the default
- **Given** `--size portrait_16_9`, **when** generating, **then** the image is generated in portrait orientation
- **Given** `--output ./my-images`, **when** generating, **then** the image is saved to `./my-images/`
- **Given** `--json` flag, **when** generating, **then** output is valid JSON matching `GenerateResult`
- **Given** a missing `--prompt`, **when** running generate, **then** an error is shown with usage instructions
- **Given** generation in progress, **when** the model is queued, **then** a spinner shows queue position

## Testing Strategy

- Unit test `generateFilename()` for correct format
- Unit test `saveImage()` with mocked fetch (verify file is written correctly)
- Unit test `generateImage()` with mocked fal client
- Test local file upload path detection (URL vs local path)
- Test error handling for missing file, API errors, network failures
- Integration test with live API (optional)
