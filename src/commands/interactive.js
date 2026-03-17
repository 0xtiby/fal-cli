import { Cli } from 'incur';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { listCategories, listModels, generateImage } from '../lib/fal-client.js';
import { saveImage } from '../lib/image-saver.js';
import { promptCategory, promptModel, promptText, promptSize } from '../lib/prompts.js';
import { withErrorHandling } from '../lib/errors.js';

/**
 * Run the interactive wizard flow.
 * @param {{ _deps?: object }} [options] - Internal options for testing
 */
export async function runInteractiveFlow(options = {}) {
  const deps = {
    loadConfig,
    listCategories,
    listModels,
    generateImage,
    saveImage,
    promptCategory,
    promptModel,
    promptText,
    promptSize,
    ora,
    stdout: process.stdout,
    ...options._deps,
  };

  const config = deps.loadConfig();

  const categories = await deps.listCategories();
  const category = await deps.promptCategory(categories);

  const models = await deps.listModels({ category });
  const modelId = await deps.promptModel(models);

  const prompt = await deps.promptText();
  const imageSize = await deps.promptSize(config.imageSize);

  const spinner = deps.ora({ text: 'Generating...', stream: deps.stdout }).start();

  const onStatus = (status) => {
    if (status.status === 'IN_QUEUE') {
      spinner.text = status.position != null
        ? `In queue (position ${status.position})...`
        : 'In queue...';
    } else if (status.status === 'IN_PROGRESS') {
      spinner.text = 'Generating...';
    }
  };

  const result = await deps.generateImage(
    { model: modelId, prompt, image_size: imageSize },
    onStatus,
  );

  const filePath = await deps.saveImage(result.url, config.outputDir, modelId);

  spinner.succeed(`Saved to ${filePath}`);

  const summary = [
    '',
    `  Model:  ${modelId}`,
    `  Size:   ${imageSize}`,
    `  Seed:   ${result.seed}`,
    `  File:   ${filePath}`,
    '',
  ].join('\n');

  deps.stdout.write(summary);
}

/**
 * Interactive command — guided wizard for model selection and image generation.
 */
export const interactiveCommand = Cli.create('interactive', {
  description: 'Guided wizard for model selection and image generation',
  run: withErrorHandling(async () => {
    await runInteractiveFlow();
  }),
});
