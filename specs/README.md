# fal-cli Specifications

A CLI tool for generating and editing images via the fal.ai API, built for both humans and AI agents.

## Tech Stack

- **Language:** JavaScript (ESM)
- **Runtime:** Node.js
- **CLI Framework:** [incur](https://github.com/wevm/incur) — agent-friendly CLI framework with built-in JSON/YAML output, `--llms` manifests, and MCP support
- **API Client:** [@fal-ai/client](https://www.npmjs.com/package/@fal-ai/client)
- **Config:** dotenv (`.env` in `~/.fal-cli/`)
- **Interactive prompts:** [@inquirer/prompts](https://www.npmjs.com/package/@inquirer/prompts)
- **Distribution:** Local (run via `npx` or `node`)

## Specs

| Spec | Source Path | Description |
|------|------------|-------------|
| [Generate Command](./06-generate-command.md) | `src/commands/generate.js`, `src/lib/` | Non-interactive generation for AI agents — supports all output types |

## Archive

Previously implemented specs are in [`archive/`](./archive/).

| Spec | Source Path | Description |
|------|------------|-------------|
| [CLI Setup & Configuration](./archive/01-cli-setup-configuration.md) | `src/config.js` | API key via .env, default settings, client initialization |
| [Model Discovery](./archive/02-model-discovery.md) | `src/commands/models.js` | List and filter available image generation models |
| [Image Generation & Editing](./archive/03-image-generation-editing.md) | `src/commands/generate.js`, `src/lib/` | Generate images from text, edit with reference images, save to disk |
| [Interactive Mode](./archive/04-interactive-mode.md) | `src/commands/interactive.js` | Guided step-by-step session for model selection and generation |
| [CLI Entry Point & Global Behavior](./archive/05-cli-entrypoint.md) | `src/index.js`, `src/lib/errors.js` | Bootstrap, command registration, global flags, error handling, exit codes |
