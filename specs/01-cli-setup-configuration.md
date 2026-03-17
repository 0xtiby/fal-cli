# 01 — CLI Setup & Configuration

Manage API key and default settings via a `.env` file stored in the user's home directory.

## Overview

The CLI reads configuration from `~/.fal-cli/.env`. This file holds the fal.ai API key and optional defaults for model, output directory, and image size. The `@fal-ai/client` is initialized once at startup using these values.

## Users & Problem

- **Primary user:** Developer or AI agent invoking the CLI
- **Problem:** Users need a persistent way to store their API key and preferences without passing them as flags every time

## Scope

**In scope:**
- Load `.env` from `~/.fal-cli/.env`
- Support `FAL_KEY`, `FAL_DEFAULT_MODEL`, `FAL_OUTPUT_DIR`, `FAL_IMAGE_SIZE` env vars
- Initialize `@fal-ai/client` with the loaded API key
- Provide defaults that commands can override via flags

**Out of scope:**
- `init` or `config set` commands (users edit `.env` manually)
- Multiple profiles or workspaces
- Credential encryption

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FAL_KEY` | Yes | — | fal.ai API key from [dashboard](https://fal.ai/dashboard/keys) |
| `FAL_DEFAULT_MODEL` | No | `fal-ai/flux/schnell` | Default model endpoint ID |
| `FAL_OUTPUT_DIR` | No | `./generated` | Directory where images are saved |
| `FAL_IMAGE_SIZE` | No | `landscape_4_3` | Default image size preset |
| `FAL_VERBOSE` | No | — | Set to `1` to enable verbose/debug output (same as `--verbose`) |

## Business Rules

- If `FAL_KEY` is missing, the CLI must exit with a clear error message explaining how to set it up
- Flag values always override `.env` defaults
- The `.fal-cli` directory in `$HOME` is **not** auto-created — the user must create it and the `.env` file manually
- Environment variables set in the shell (e.g. `export FAL_KEY=...`) take precedence over the `.env` file

## Data Model

```js
/** @typedef {Object} Config
 * @property {string} falKey - fal.ai API key
 * @property {string} defaultModel - Default model endpoint ID
 * @property {string} outputDir - Default output directory for saved images
 * @property {string} imageSize - Default image size preset
 * @property {boolean} verbose - Enable verbose/debug output
 */

/** @type {string[]} Valid image size presets */
const IMAGE_SIZE_PRESETS = [
  'square_hd',
  'square',
  'landscape_4_3',
  'landscape_16_9',
  'portrait_4_3',
  'portrait_16_9',
]
```

## API / Interface

```js
// src/config.js

/**
 * Load configuration from ~/.fal-cli/.env and merge with shell env vars.
 * Exits with error if FAL_KEY is not set.
 * @returns {Config}
 */
export function loadConfig() {}

/**
 * Initialize the fal client with the loaded API key.
 * Must be called once at CLI startup.
 * @param {Config} config
 */
export function initFalClient(config) {}

/**
 * Resolve effective config by merging .env defaults with command flags.
 * @param {Config} config - Base config from .env
 * @param {Partial<Config>} overrides - Flags from the command
 * @returns {Config}
 */
export function resolveConfig(config, overrides) {}
```

## Architecture

```
CLI startup (src/index.js)
  │
  ├─ loadConfig()        ← reads ~/.fal-cli/.env + shell env
  ├─ initFalClient()     ← configures @fal-ai/client
  └─ register commands   ← passes config to each command
```

Dependencies: `dotenv` for parsing `.env` files, `@fal-ai/client` for API initialization.

## Edge Cases

- **Missing `~/.fal-cli/.env`:** Fall back to shell environment variables only. If `FAL_KEY` still missing, exit with setup instructions.
- **Invalid API key:** The CLI does not validate the key at startup. API calls will fail with a 401 — the generate/models commands handle this error.
- **Invalid image size preset:** Commands validate against `IMAGE_SIZE_PRESETS` and show allowed values on mismatch.

## Exit Code Conventions

All CLI commands follow a consistent set of exit codes. See [spec 05](./05-cli-entrypoint.md) for the full table. Config-related errors (missing `FAL_KEY`, invalid preset) use exit code **2**.

## Acceptance Criteria

- **Given** a valid `.env` file at `~/.fal-cli/.env` with `FAL_KEY=xxx`, **when** the CLI starts, **then** the fal client is configured with that key
- **Given** no `.env` file and no `FAL_KEY` in shell env, **when** the CLI starts, **then** it exits with error code 1 and prints setup instructions
- **Given** `FAL_DEFAULT_MODEL=fal-ai/flux/dev` in `.env` and `--model fal-ai/recraft/v4/pro/text-to-image` as a flag, **when** a command resolves config, **then** the flag value is used
- **Given** `export FAL_KEY=shell-key` in the shell and `FAL_KEY=dotenv-key` in `.env`, **when** config loads, **then** `shell-key` is used
