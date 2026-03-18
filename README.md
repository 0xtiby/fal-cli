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
