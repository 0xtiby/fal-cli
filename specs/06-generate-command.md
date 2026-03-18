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

- `--model` is **required**. Exit with error if missing. Agents must be explicit about which model to use.
- `--prompt` is **required**. Exit with error if missing.
- `--size` defaults to `FAL_IMAGE_SIZE` from config (fallback: `landscape_4_3`). Only relevant for models that accept `image_size`.
- `--output` defaults to `FAL_OUTPUT_DIR` from config (fallback: `./generated`).
- `--seed` is optional. If omitted, the API picks a random seed. The seed used is always included in the output.
- `--image` accepts local file paths or URLs. Local files are uploaded to fal.ai storage before the request.
- `--image` can be specified multiple times (`--image a.jpg --image b.jpg`) or comma-separated (`--image a.jpg,b.jpg`). Both forms are equivalent.
- `--category` is optional. When provided, it is included in the JSON output for documentation purposes but does not change behavior.
- The CLI uses `fal.subscribe()` to submit the request and poll for results with status updates.
- **All** output files from the response are downloaded and saved — not just the first.
- The output directory is created automatically if it doesn't exist.
- Files are named with the existing pattern: `YYYY-MM-DD_HHmmss_<model-slug>.<ext>`. When multiple files are saved, a numeric suffix is appended: `_001`, `_002`, etc.
- File extension is derived from the CDN response `content-type` header. Falls back to appropriate defaults per media type.
- The fal.ai response shape varies by model. Common patterns:
  - `{ images: [{ url, width, height }], seed }` — image models
  - `{ video: { url } }` — video models
  - `{ audio: { url } }` — audio models
  - Other shapes — extract any URLs found in the response
- The command must normalize all these into a consistent `files[]` array.

## UI/UX

### Standard output (human mode)

```
⠋ Queued (position 3)...
⠙ Generating...
✓ Saved 1 file to ./generated/

  Model:  fal-ai/flux/schnell
  Seed:   42981337
  Files:
    ./generated/2026-03-18_143022_flux-schnell.png (1024×768)
```

### Multi-file output

```
✓ Saved 3 files to ./generated/

  Model:  fal-ai/flux/schnell
  Seed:   42981337
  Files:
    ./generated/2026-03-18_143022_flux-schnell_001.png (1024×768)
    ./generated/2026-03-18_143022_flux-schnell_002.png (1024×768)
    ./generated/2026-03-18_143022_flux-schnell_003.png (512×512)
```

### JSON output (`--json`)

```json
{
  "model": "fal-ai/flux/schnell",
  "seed": 42981337,
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

```
✗ Error: Missing required flag --model. Usage: fal-cli generate --model <model-id> --prompt "your prompt"
```

```
✗ Error: Missing required flag --prompt. Usage: fal-cli generate --model <model-id> --prompt "your prompt"
```

```
✗ Error: File not found: ./photo.jpg
```

### States

- **Queued:** Spinner with queue position
- **In progress:** Spinner with "Generating..."
- **Success:** Checkmark + saved paths + metadata
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
// returns: GenerateResult
```

```js
// src/lib/fal-client.js — new or updated functions

/**
 * Extract output file URLs from a fal.ai API response.
 * Handles varying response shapes: images[], video, audio, or generic URL fields.
 *
 * @param {Object} data - Raw response data from fal.subscribe()
 * @returns {{ url: string, width?: number, height?: number }[]}
 */
export function extractOutputFiles(data) {}
```

```js
// src/lib/image-saver.js — updated functions

/**
 * Extended content-type to extension mapping.
 * Supports image/*, video/*, audio/* types.
 */

/**
 * Save a file (image, video, audio) from a URL to disk.
 * Handles any content type, not just images.
 *
 * @param {string} url - CDN URL
 * @param {string} outputDir - Target directory
 * @param {string} modelId - Model ID for filename
 * @param {{ suffix?: string, _fetch?: typeof fetch }} [options] - suffix for multi-file naming
 * @returns {Promise<{ localPath: string, contentType: string }>}
 */
export async function saveFile(url, outputDir, modelId, options = {}) {}
```

## Architecture

```
fal-cli generate --model fal-ai/flux/schnell --prompt "sunset" --image ./photo.jpg
  │
  ├─ Parse flags (incur) — validate --model and --prompt required
  ├─ resolveConfig(config, flags) — merge defaults with overrides
  ├─ For each --image:
  │    ├─ Is it a URL? → use as-is
  │    └─ Is it a local path? → resolveImageUrl() → upload to fal storage
  ├─ fal.subscribe(model, { input: { prompt, image_url, image_urls, image_size, seed } })
  │    └─ onQueueUpdate → spinner progress
  ├─ extractOutputFiles(response.data) → normalize to [{ url, width, height }]
  ├─ For each output file:
  │    └─ saveFile(url, outputDir, model, { suffix }) → { localPath, contentType }
  └─ Return GenerateResult { model, seed, files[] }
```

### Response normalization

The `extractOutputFiles` function handles varying fal.ai response shapes:

```js
// Priority order for extracting output URLs:
// 1. data.images[] — most common (image models)
// 2. data.video.url — video models
// 3. data.audio.url — audio models
// 4. Walk the response object and collect any { url: string } values
```

## Edge Cases

- **Missing --model:** Exit code 1 with usage hint showing required flags
- **Missing --prompt:** Exit code 1 with usage hint showing required flags
- **Local image file not found:** Exit with error showing the path
- **Image upload failure:** Exit with error from fal storage API
- **Model doesn't support image input:** API returns error — display clearly
- **CDN download failure:** Retry once per file, then error with CDN URL for manual download
- **Output directory not writable:** Exit with permission error
- **Unknown response shape:** If `extractOutputFiles` finds no URLs, exit with error showing the raw response (in verbose mode) and suggesting to check the model's output format
- **Multiple --image parsing:** `--image a.jpg --image b.jpg` and `--image a.jpg,b.jpg` both produce `["a.jpg", "b.jpg"]`. Mixed forms work: `--image a.jpg,b.jpg --image c.jpg` → `["a.jpg", "b.jpg", "c.jpg"]`
- **Invalid --size value:** Show allowed values from `IMAGE_SIZE_PRESETS`
- **API timeout:** Rely on fal.subscribe's built-in timeout, show timeout error with retry suggestion
- **Multi-file naming:** When response contains N > 1 files, suffix each with `_001`, `_002`, etc. Single file gets no suffix.

## Acceptance Criteria

- **Given** `--model` and `--prompt`, **when** running `fal-cli generate --model fal-ai/flux/schnell --prompt "a cat"`, **then** the image is generated and saved to disk
- **Given** `--json` flag, **when** generating, **then** output is valid JSON matching `GenerateResult` with a `files[]` array
- **Given** `--image ./photo.jpg` with a valid file, **when** generating, **then** the file is uploaded and used as reference
- **Given** `--image https://example.com/img.jpg`, **when** generating, **then** the URL is passed directly
- **Given** `--image a.jpg --image b.jpg`, **when** generating, **then** both images are resolved and sent
- **Given** `--image a.jpg,b.jpg`, **when** generating, **then** both images are resolved and sent (comma-split)
- **Given** a model returning multiple outputs, **when** generating, **then** ALL files are saved with `_001`, `_002` suffixes
- **Given** a video model, **when** generating, **then** the video file is downloaded and saved with correct extension (e.g. `.mp4`)
- **Given** missing `--model`, **when** running generate, **then** error shows usage with required flags and exits code 1
- **Given** missing `--prompt`, **when** running generate, **then** error shows usage with required flags and exits code 1
- **Given** `--seed 42`, **when** generating, **then** the seed is sent to the API and included in the result
- **Given** `--output ./custom`, **when** generating, **then** files are saved to `./custom/`
- **Given** generation in progress, **when** the model is queued, **then** a spinner shows queue position

## Testing Strategy

- Unit test `extractOutputFiles()` with various response shapes (images[], video, audio, nested URLs)
- Unit test multi-file naming (suffix logic for single vs multiple outputs)
- Unit test `--image` parsing (repeated flags, comma-separated, mixed)
- Unit test `saveFile()` with mocked fetch for different content types (image, video, audio)
- Unit test error cases: missing flags, file not found, API errors
- Integration test with `--json` flag verifying output shape
- Test the full generate flow with mocked fal client (subscribe → extract → save → output)
