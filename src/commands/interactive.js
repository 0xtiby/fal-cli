import { Cli } from 'incur';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { listCategories, listModels, generateImage } from '../lib/fal-client.js';
import { saveImage } from '../lib/image-saver.js';
import { promptCategory, promptModel, promptText, promptSize, promptContinue, promptKeepModel, promptRetry } from '../lib/prompts.js';
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
 * Check if an error is an auth/401 error (expired or invalid API key).
 * @param {*} err
 * @returns {boolean}
 */
function isAuthError(err) {
  return err?.code === 'CONFIG_ERROR' && (err?.status === 401 || err?.message?.includes('API key'));
}

/**
 * Fetch categories with retry on failure. Auth errors exit immediately.
 * @param {object} deps
 * @returns {Promise<string[]>}
 */
async function fetchCategoriesWithRetry(deps) {
  while (true) {
    try {
      return await deps.listCategories();
    } catch (err) {
      if (isAuthError(err)) {
        deps.stderr.write('✗ Authentication failed. Run `fal config` to update your API key.\n');
        deps.exit(1);
        return;
      }
      deps.stderr.write(`✗ Failed to fetch categories: ${err.message}\n`);
      const retry = await deps.promptRetry();
      if (!retry) {
        deps.exit(1);
        return;
      }
    }
  }
}

/**
 * Fetch models with retry on failure.
 * Returns models on success, empty array for no models in category,
 * or null when the flow should exit (auth error or user declined retry).
 * @param {object} deps
 * @param {string} category
 * @returns {Promise<{endpointId: string, name: string}[]|null>}
 */
async function fetchModelsWithRetry(deps, category) {
  while (true) {
    try {
      const models = await deps.listModels({ category });
      if (models.length === 0) {
        deps.stderr.write('No models found in this category.\n');
        return [];
      }
      return models;
    } catch (err) {
      if (isAuthError(err)) {
        deps.stderr.write('✗ Authentication failed. Run `fal config` to update your API key.\n');
        deps.exit(1);
        return null;
      }
      deps.stderr.write(`✗ Failed to fetch models: ${err.message}\n`);
      const retry = await deps.promptRetry();
      if (!retry) {
        deps.exit(1);
        return null;
      }
    }
  }
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
    promptRetry,
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

    let categories = await fetchCategoriesWithRetry(deps);
    if (!categories) return;
    let category = await deps.promptCategory(categories);

    let models;
    while (true) {
      models = await fetchModelsWithRetry(deps, category);
      if (models === null) return; // exit requested
      if (models.length === 0) {
        // Empty category — re-prompt for category
        categories = await fetchCategoriesWithRetry(deps);
        if (!categories) return;
        category = await deps.promptCategory(categories);
        continue;
      }
      break;
    }
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
      } catch (err) {
        spinner.stop();
        deps.processRemoveListener('SIGINT', sigintHandler);
        if (isAuthError(err)) {
          deps.stderr.write('✗ Authentication failed. Run `fal config` to update your API key.\n');
          deps.exit(1);
          return;
        }
        deps.stderr.write(`✗ Generation failed: ${err.message ?? err}\n`);
        const retry = await deps.promptRetry();
        if (!retry) {
          deps.exit(1);
          return;
        }
        continue;
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
        categories = await fetchCategoriesWithRetry(deps);
        if (!categories) return;
        category = await deps.promptCategory(categories);
        while (true) {
          models = await fetchModelsWithRetry(deps, category);
          if (models === null) return; // exit requested
          if (models.length === 0) {
            categories = await fetchCategoriesWithRetry(deps);
            if (!categories) return;
            category = await deps.promptCategory(categories);
            continue;
          }
          break;
        }
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
