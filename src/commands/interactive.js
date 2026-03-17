import { Cli } from 'incur';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { listCategories, listModels, generateImage } from '../lib/fal-client.js';
import { saveImage } from '../lib/image-saver.js';
import { promptCategory, promptModel, promptText, promptSize, promptContinue, promptKeepModel } from '../lib/prompts.js';
import { withErrorHandling } from '../lib/errors.js';

/**
 * Check if an error is an ExitPromptError thrown by @inquirer/prompts on Ctrl+C.
 * @param {Error} err
 * @returns {boolean}
 */
function isExitPromptError(err) {
  return err?.name === 'ExitPromptError';
}

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
    promptContinue,
    promptKeepModel,
    ora,
    stdout: process.stdout,
    stderr: process.stderr,
    exit: process.exit,
    processOn: process.on.bind(process),
    processRemoveListener: process.removeListener.bind(process),
    ...options._deps,
  };

  try {
    const config = deps.loadConfig();

    let categories = await deps.listCategories();
    let category = await deps.promptCategory(categories);
    let models = await deps.listModels({ category });
    let modelId = await deps.promptModel(models);

    while (true) {
      const prompt = await deps.promptText();
      const imageSize = await deps.promptSize(config.imageSize);

      const spinner = deps.ora({ text: 'Generating...', stream: deps.stdout }).start();

      const sigintHandler = () => {
        spinner.stop();
        deps.stderr.write('\n');
        deps.exit(0);
      };
      deps.processOn('SIGINT', sigintHandler);

      let result;
      try {
        const onStatus = (status) => {
          if (status.status === 'IN_QUEUE') {
            spinner.text = status.position != null
              ? `In queue (position ${status.position})...`
              : 'In queue...';
          } else if (status.status === 'IN_PROGRESS') {
            spinner.text = 'Generating...';
          }
        };

        result = await deps.generateImage(
          { model: modelId, prompt, image_size: imageSize },
          onStatus,
        );
      } finally {
        deps.processRemoveListener('SIGINT', sigintHandler);
      }

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

      const shouldContinue = await deps.promptContinue();
      if (!shouldContinue) break;

      const keepModel = await deps.promptKeepModel();
      if (!keepModel) {
        categories = await deps.listCategories();
        category = await deps.promptCategory(categories);
        models = await deps.listModels({ category });
        modelId = await deps.promptModel(models);
      }
    }
  } catch (err) {
    if (isExitPromptError(err)) {
      deps.stderr.write('\n');
      deps.exit(0);
      return;
    }
    throw err;
  }
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
