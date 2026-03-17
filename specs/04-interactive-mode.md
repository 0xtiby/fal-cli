# 04 — Interactive Mode

Guided step-by-step session to pick a model, configure options, and generate or edit images interactively.

## Overview

The `interactive` command launches a step-by-step wizard that walks the user through the entire image generation flow: pick a category, pick a model, optionally provide a reference image, enter a prompt, choose a size, and generate. After each generation, the user can continue with another prompt or exit.

## Users & Problem

- **Primary user:** Developer who wants to explore models and iterate on prompts without remembering flags
- **Problem:** New users don't know model IDs, size presets, or the right flags — interactive mode removes that friction

## Scope

**In scope:**
- Step-by-step guided flow with interactive prompts
- Category selection → model selection → prompt input → optional reference image → size selection → generate
- Loop: after generation, ask to continue or exit
- Use the same `generateImage` and `saveImage` functions from spec 03

**Out of scope:**
- History of previous prompts/generations
- Editing generation parameters mid-flow (must restart the flow)
- GUI or TUI image preview

## User Story

1. **As a developer**, I can run `fal-cli interactive` so that I'm guided through the image generation process step by step

## Interactive Flow

```
$ fal-cli interactive

? Select a category: (use arrow keys)
  ❯ text-to-image
    image-to-image
    image-to-video
    training

? Select a model: (use arrow keys)
  ❯ fal-ai/flux/schnell — FLUX.1 Schnell
    fal-ai/flux/dev — FLUX.1 Dev
    fal-ai/recraft/v4/pro/text-to-image — Recraft V4 Pro
    ...

? Do you want to use a reference image? (y/N) y

? Enter image path or URL: ./photo.jpg

? Enter your prompt: a sunset over mountains in cyberpunk style

? Select image size:
  ❯ landscape_4_3
    landscape_16_9
    square
    square_hd
    portrait_4_3
    portrait_16_9

⠋ Queued (position 2)...
⠙ Generating...
✓ Image saved to ./generated/2026-03-17_143022_flux-schnell.png

  Model:  fal-ai/flux/schnell
  Size:   1024x768
  Seed:   42981337
  Path:   ./generated/2026-03-17_143022_flux-schnell.png

? Generate another image? (Y/n) y

? Keep the same model? (Y/n) n

? Select a category: ...
(loop continues)
```

## Business Rules

- Categories and models are fetched live from the API (reuses `listCategories()` and `listModels()` from spec 02)
- The reference image question only appears if the user wants one — default is "No"
- When looping, ask if user wants to keep the same model or pick a new one
- If keeping the same model, skip category and model selection — go straight to reference image → prompt → size
- The prompt input must not be empty — re-ask if it is
- Size defaults to the config value but can be changed each iteration
- All generation uses the same `generateImage()` and `saveImage()` from spec 03
- Ctrl+C at any point exits cleanly without error

## Data Model

No new types — reuses `Model`, `GenerateInput`, `GenerateResult`, and `Config` from specs 01-03.

## API / Interface

```js
// src/commands/interactive.js — incur command definition

// no args, no options (everything is prompted)
// runs an interactive loop using @inquirer/prompts

/**
 * Run the interactive image generation session.
 * @param {Config} config - Loaded configuration
 */
export async function runInteractive(config) {}
```

```js
// src/lib/prompts.js — interactive prompt helpers

/**
 * Prompt user to select a category from available categories.
 * @param {string[]} categories
 * @returns {Promise<string>}
 */
export async function promptCategory(categories) {}

/**
 * Prompt user to select a model from a filtered list.
 * @param {Model[]} models
 * @returns {Promise<string>} Selected model endpoint ID
 */
export async function promptModel(models) {}

/**
 * Prompt user for an optional reference image path or URL.
 * @returns {Promise<string|null>} Image path/URL or null if skipped
 */
export async function promptReferenceImage() {}

/**
 * Prompt user for a text prompt. Re-asks if empty.
 * @returns {Promise<string>}
 */
export async function promptText() {}

/**
 * Prompt user to select an image size preset.
 * @param {string} defaultSize - Default from config
 * @returns {Promise<string>}
 */
export async function promptSize(defaultSize) {}

/**
 * Ask if user wants to generate another image.
 * @returns {Promise<boolean>}
 */
export async function promptContinue() {}

/**
 * Ask if user wants to keep the current model.
 * @returns {Promise<boolean>}
 */
export async function promptKeepModel() {}
```

## Architecture

```
fal-cli interactive
  │
  ├─ loadConfig()
  ├─ listCategories() → display category picker
  ├─ listModels({ category }) → display model picker
  │
  ├─ LOOP:
  │   ├─ promptReferenceImage() → optional image path/URL
  │   ├─ promptText() → prompt string
  │   ├─ promptSize() → size preset
  │   ├─ generateImage(...) → spinner + result
  │   ├─ saveImage(...) → download + save
  │   ├─ Display result summary
  │   ├─ promptContinue()?
  │   │    ├─ No → exit
  │   │    └─ Yes → promptKeepModel()?
  │   │         ├─ Yes → back to LOOP (skip category/model)
  │   │         └─ No → back to category picker
  │   └─ (repeat)
  │
  └─ Clean exit
```

Dependencies: `@inquirer/prompts` for interactive prompts, reuses `listModels`, `listCategories`, `generateImage`, `saveImage` from other modules.

## Edge Cases

- **No models in selected category:** Display message and go back to category selection
- **API failure during model fetch:** Display error and ask to retry or exit
- **Empty prompt entered:** Re-prompt with "Prompt cannot be empty"
- **Invalid image path:** Display "File not found" and re-prompt
- **Ctrl+C during prompt:** Exit cleanly with no error stacktrace
- **Ctrl+C during generation:** Cancel the request if possible, exit cleanly
- **API key expired mid-session:** Display auth error and exit with setup instructions

## Acceptance Criteria

- **Given** a valid API key, **when** running `fal-cli interactive`, **then** the user is guided through category → model → prompt → size → generate
- **Given** the user selects "yes" for reference image, **when** prompted, **then** they can enter a local path or URL
- **Given** generation completes, **when** asked "Generate another?", **then** answering "yes" loops back
- **Given** the user keeps the same model, **when** looping, **then** category and model selection are skipped
- **Given** the user enters an empty prompt, **when** submitting, **then** the prompt is re-asked
- **Given** Ctrl+C is pressed at any point, **when** exiting, **then** no error stacktrace is shown

## Testing Strategy

- Unit test each prompt helper with mocked `@inquirer/prompts`
- Test the loop logic: continue flow, change model flow, exit flow
- Test Ctrl+C handling
- Integration test of full interactive flow with mocked API (optional)
