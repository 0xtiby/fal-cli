# 02 — Model Discovery

List and search available fal.ai image generation models by category.

## Overview

The `models` command fetches available models from the fal.ai platform API (`GET https://api.fal.ai/v1/models`) and displays them in a table. A `models categories` subcommand lists available category filters. Output is human-friendly by default, JSON with `--json`.

## Users & Problem

- **Primary user:** Developer choosing which model to use for image generation
- **AI agent user:** Needs to programmatically discover available models and their IDs
- **Problem:** fal.ai has 1000+ models — users need a way to find the right image generation model without leaving the terminal

## Scope

**In scope:**
- List models with endpoint ID, name, and category
- Filter by category (e.g. `text-to-image`, `image-to-image`)
- List available categories
- Pagination support (auto-fetch all pages or limit)
- JSON output mode for agents

**Out of scope:**
- Model details/info command (view full description, pricing)
- Model comparison
- Favoriting or bookmarking models

## User Stories

1. **As a developer**, I can run `fal-cli models` so that I see all available models
2. **As a developer**, I can run `fal-cli models --category text-to-image` so that I only see text-to-image models
3. **As a developer**, I can run `fal-cli models categories` so that I know which categories are available to filter by
4. **As an AI agent**, I can run `fal-cli models --json` so that I get structured data I can parse

## Business Rules

- The `models` command calls `GET https://api.fal.ai/v1/models` with the `FAL_KEY` for authentication
- When `--category` is provided, pass it as a query parameter to filter server-side
- Only show models with `status: active` by default (exclude deprecated)
- Categories are derived from the API response — fetch models and extract unique categories
- Pagination: follow `next_cursor` / `has_more` to fetch all results

## UI/UX

### `fal-cli models`

```
  Endpoint ID                              Name                    Category
  ─────────────────────────────────────────────────────────────────────────────
  fal-ai/flux/schnell                      FLUX.1 Schnell          text-to-image
  fal-ai/flux/dev                          FLUX.1 Dev              text-to-image
  fal-ai/recraft/v4/pro/text-to-image      Recraft V4 Pro          text-to-image
  ...
```

### `fal-cli models categories`

```
  Category
  ──────────────────
  text-to-image
  image-to-image
  image-to-video
  training
  ...
```

### `fal-cli models --json`

```json
{
  "models": [
    { "endpointId": "fal-ai/flux/schnell", "name": "FLUX.1 Schnell", "category": "text-to-image" },
    ...
  ]
}
```

### `fal-cli models categories --json`

```json
{
  "categories": ["text-to-image", "image-to-image", "image-to-video", "training"]
}
```

## Platform API Response Shape

The `GET https://api.fal.ai/v1/models` endpoint returns a paginated list. The raw response shape (relevant fields):

```json
{
  "data": [
    {
      "id": "fal-ai/flux/schnell",
      "name": "FLUX.1 Schnell",
      "category": "text-to-image",
      "status": "active",
      "description": "Fast image generation model...",
      "created_at": "2025-01-15T..."
    }
  ],
  "has_more": true,
  "next_cursor": "abc123"
}
```

Query parameters:
- `category` (string, optional) — filter by category
- `status` (string, optional) — filter by status (default: `active`)
- `cursor` (string, optional) — pagination cursor from previous response
- `limit` (number, optional) — page size

The CLI extracts `id` → `endpointId`, `name`, and `category` from each item. Other fields (`description`, `created_at`) are discarded for now but available for a future `models info` command.

## Caching

Model lists change infrequently. To avoid redundant API calls — especially in interactive mode (spec 04) where models may be fetched multiple times per session:

- Cache the full model list **in-memory** for the duration of the process
- No disk-based cache (keeps implementation simple)
- `listModels()` returns cached results if called again with the same filters
- `listCategories()` derives from the cached model list

This means interactive mode's "pick another model" loop won't re-fetch unless the process restarts.

## Data Model

```js
/** @typedef {Object} Model
 * @property {string} endpointId - Stable model identifier (e.g. "fal-ai/flux/schnell")
 * @property {string} name - Human-readable display name
 * @property {string} category - Model category (e.g. "text-to-image")
 */

/** @typedef {Object} ModelsResponse
 * @property {Model[]} models
 */

/** @typedef {Object} CategoriesResponse
 * @property {string[]} categories
 */
```

## API / Interface

```js
// src/commands/models.js — incur command definitions

// models command
// options: { category: z.string().optional().describe('Filter by category') }
// returns: ModelsResponse

// models categories subcommand
// no options
// returns: CategoriesResponse
```

```js
// src/lib/fal-client.js

/**
 * Fetch all models from the fal.ai platform API.
 * Handles pagination automatically.
 * @param {Object} [filters]
 * @param {string} [filters.category] - Filter by category
 * @returns {Promise<Model[]>}
 */
export async function listModels(filters) {}

/**
 * Fetch all unique categories from available models.
 * @returns {Promise<string[]>}
 */
export async function listCategories() {}
```

## Architecture

```
fal-cli models --category text-to-image
  │
  ├─ Parse options (incur)
  ├─ listModels({ category: 'text-to-image' })
  │    └─ GET https://api.fal.ai/v1/models?category=text-to-image&status=active
  │         └─ Follow pagination (next_cursor) until has_more=false
  └─ Return { models: [...] }  ← incur formats as table or JSON
```

The `models` command uses the fal.ai **Platform API** directly via `fetch()` (not the `@fal-ai/client` SDK, which is for inference). Auth header: `Authorization: Key <FAL_KEY>`.

## Edge Cases

- **No models match filter:** Return empty array, display "No models found for category 'xxx'"
- **Invalid category:** No server-side validation — just returns empty results. The CLI should suggest running `models categories`
- **API rate limit (429):** Display error with retry suggestion
- **Network failure:** Display connection error with suggestion to check internet
- **Invalid API key (401):** Display auth error with setup instructions

## Acceptance Criteria

- **Given** a valid API key, **when** running `fal-cli models`, **then** a list of active models is displayed with endpoint ID, name, and category
- **Given** `--category text-to-image`, **when** running `fal-cli models`, **then** only text-to-image models appear
- **Given** `--json` flag, **when** running `fal-cli models`, **then** output is valid JSON matching `ModelsResponse` shape
- **Given** a valid API key, **when** running `fal-cli models categories`, **then** all unique categories are listed
- **Given** no matching models for a category, **when** running `fal-cli models --category nonexistent`, **then** a helpful message is shown suggesting `models categories`

## Testing Strategy

- Unit test `listModels()` and `listCategories()` with mocked HTTP responses
- Test pagination by mocking multi-page responses
- Test error handling for 401, 429, network errors
- Integration test against live API (optional, requires key)
