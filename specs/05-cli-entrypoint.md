# 05 — CLI Entry Point & Global Behavior

Bootstrap the incur CLI framework, register all commands, and define global flags and behaviors.

## Overview

The entry point (`src/index.js`) initializes configuration, sets up the fal.ai client, and registers all commands with the incur framework. It also defines global flags available to every command (`--verbose`, `--json`) and handles top-level error formatting.

## Users & Problem

- **Primary user:** Developer or AI agent invoking any `fal-cli` command
- **Problem:** Commands need consistent initialization (config loading, client setup) and uniform behavior (error formatting, exit codes, output modes)

## Scope

**In scope:**
- incur CLI definition with name, version, description
- Global flags: `--verbose`, `--json` (provided by incur), `--version`, `--help`
- Command registration for `models`, `generate`, `interactive`
- Config loading and fal client initialization before command execution
- Global error handler with consistent formatting
- Exit code conventions
- `--llms` manifest support (incur built-in)

**Out of scope:**
- MCP server mode (future spec)
- Plugin system or dynamic command loading
- Shell completions

## Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output structured JSON instead of human-friendly text (incur built-in) |
| `--verbose` | Print debug information: API URLs, request/response details, timing |
| `--version` | Print version and exit |
| `--help` | Print help text and exit |

The `--verbose` flag can also be enabled via the `FAL_VERBOSE=1` environment variable (see spec 01).

## Exit Code Conventions

All commands across the CLI follow these exit codes:

| Code | Meaning | Example |
|------|---------|---------|
| `0` | Success | Command completed normally |
| `1` | General error | Missing required flag, file not found, invalid input |
| `2` | Configuration error | Missing `FAL_KEY`, invalid config |
| `3` | API error | 401 unauthorized, 429 rate limit, 5xx server error |
| `4` | Network error | Connection refused, DNS failure, timeout |

## Error Formatting

All errors are written to **stderr** and follow this format:

```
✗ Error: <message>
```

When `--verbose` is enabled, the full error details are printed below:

```
✗ Error: API request failed (401 Unauthorized)

  URL:      https://api.fal.ai/v1/models
  Status:   401
  Response: {"detail": "Invalid API key"}
```

When `--json` is active, errors are output as JSON to stdout (for agent consumption):

```json
{
  "error": {
    "code": "API_ERROR",
    "message": "API request failed (401 Unauthorized)",
    "status": 401
  }
}
```

## Data Model

```js
/** @typedef {Object} GlobalOptions
 * @property {boolean} json - Output as JSON (incur built-in)
 * @property {boolean} verbose - Enable debug output
 */

/** @typedef {Object} CLIError
 * @property {string} code - Error code (e.g. "CONFIG_ERROR", "API_ERROR", "NETWORK_ERROR")
 * @property {string} message - Human-readable error message
 * @property {number} [status] - HTTP status code if applicable
 * @property {Object} [details] - Additional debug info (shown with --verbose)
 */

/** @type {Object.<string, number>} Error code to exit code mapping */
const EXIT_CODES = {
  CONFIG_ERROR: 2,
  API_ERROR: 3,
  NETWORK_ERROR: 4,
}
```

## API / Interface

```js
// src/index.js

import { createCli } from 'incur'
import { loadConfig, initFalClient } from './config.js'
import { modelsCommand } from './commands/models.js'
import { generateCommand } from './commands/generate.js'
import { interactiveCommand } from './commands/interactive.js'

const config = loadConfig()
initFalClient(config)

const cli = createCli({
  name: 'fal-cli',
  version: '0.1.0',
  description: 'Generate and edit images via fal.ai',
  commands: [modelsCommand, generateCommand, interactiveCommand],
})

cli.run()
```

```js
// src/lib/errors.js

/**
 * Format and print an error, then exit with the appropriate code.
 * Respects --json and --verbose flags.
 *
 * @param {CLIError} error
 * @param {GlobalOptions} options
 */
export function handleError(error, options) {}

/**
 * Wrap an async command handler with consistent error handling.
 *
 * @param {Function} handler - The command's action function
 * @returns {Function} Wrapped handler that catches errors and calls handleError
 */
export function withErrorHandling(handler) {}
```

## Architecture

```
$ fal-cli generate --prompt "a cat" --verbose
  │
  ├─ src/index.js
  │    ├─ loadConfig()           ← reads ~/.fal-cli/.env + shell env
  │    ├─ initFalClient(config)  ← configures @fal-ai/client
  │    └─ cli.run()              ← incur parses args, routes to command
  │
  ├─ incur resolves command: generateCommand
  │    ├─ Parses --prompt, --verbose (global flag)
  │    └─ Calls handler wrapped in withErrorHandling()
  │
  └─ On error:
       ├─ handleError() formats the error
       ├─ Writes to stderr (or JSON to stdout)
       └─ process.exit(exitCode)
```

## Edge Cases

- **Unknown command:** incur displays help text with available commands and exits with code 1
- **Unknown flag:** incur displays error and suggests correct flag name
- **No command given:** Display help text (same as `--help`)
- **incur's `--llms` flag:** Returns a manifest describing all commands, their options, and descriptions in a format suitable for LLM tool-use

## Acceptance Criteria

- **Given** no arguments, **when** running `fal-cli`, **then** help text is displayed listing all commands
- **Given** `--version` flag, **when** running `fal-cli --version`, **then** the version is printed and the process exits with code 0
- **Given** an API error occurs, **when** `--verbose` is enabled, **then** full request/response details are printed to stderr
- **Given** an API error occurs, **when** `--json` is enabled, **then** a structured error object is written to stdout
- **Given** a missing `FAL_KEY`, **when** any command runs, **then** the process exits with code 2
- **Given** a network failure, **when** any command runs, **then** the process exits with code 4

## Testing Strategy

- Unit test `handleError()` output for each error type (config, API, network)
- Unit test `handleError()` respects `--json` and `--verbose` flags
- Test exit codes match the conventions table
- Test that unknown commands/flags produce helpful output
