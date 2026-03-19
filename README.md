# @0xtiby/fal-cli

CLI tool for generating and editing images via the [fal.ai](https://fal.ai) API.

## Install

```bash
npm install -g @0xtiby/fal-cli
```

## Setup

Set your fal.ai API key:

```bash
export FAL_KEY=your-api-key
```

Or add it to `~/.fal-cli/.env` for persistent configuration (see [Configuration](#configuration) below).

## Configuration

fal-cli loads configuration from multiple sources in the following precedence order:

1. **CLI flags** (highest priority)
2. **Shell environment variables** (`export FAL_KEY=...`)
3. **Config file** (`~/.fal-cli/.env`)
4. **Built-in defaults** (lowest priority)

### Config file

Create `~/.fal-cli/.env` to set persistent defaults:

```env
FAL_KEY=your-api-key-here
FAL_DEFAULT_MODEL=fal-ai/flux/schnell
FAL_OUTPUT_DIR=./generated
FAL_IMAGE_SIZE=landscape_4_3
FAL_VERBOSE=false
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `FAL_KEY` | *(required)* | fal.ai API key |
| `FAL_DEFAULT_MODEL` | `fal-ai/flux/schnell` | Default model endpoint |
| `FAL_OUTPUT_DIR` | `./generated` | Output directory for generated files |
| `FAL_IMAGE_SIZE` | `landscape_4_3` | Default image size preset |
| `FAL_VERBOSE` | `false` | Show full request/response |

## Usage

### Generate media from a prompt

```bash
fal-cli generate --model fal-ai/flux/schnell --prompt "a cat in space"
```

Options:

| Flag | Description |
|------|-------------|
| `--model` | Model endpoint ID (e.g. `fal-ai/flux/schnell`) |
| `--prompt` | Text prompt for generation |
| `--image` | Reference image: path, URL, data URI, or `-` for stdin |
| `--size` | Image size preset (`square_hd`, `landscape_16_9`, etc.) |
| `--output` | Output directory |
| `--seed` | Seed for reproducible generation |
| `--verbose` | Show full request/response |

### Interactive mode

Guided wizard for model selection and image generation:

```bash
fal-cli interactive
```

### Browse models

```bash
fal-cli models              # List all models
fal-cli models categories   # List model categories
```

## License

MIT
