import { select, input, confirm } from '@inquirer/prompts';

/**
 * Prompt the user to select a model category.
 * @param {string[]} categories - Available category names
 * @param {{ _select?: Function }} [options] - Internal options for testing
 * @returns {Promise<string>} Selected category
 */
export async function promptCategory(categories, options = {}) {
  const selectFn = options._select ?? select;
  return selectFn({
    message: 'Select a category:',
    choices: categories.map((c) => ({ name: c, value: c })),
  });
}

/**
 * Prompt the user to select a model.
 * @param {{ endpointId: string, name: string }[]} models - Available models
 * @param {{ _select?: Function }} [options] - Internal options for testing
 * @returns {Promise<string>} Selected endpoint ID
 */
export async function promptModel(models, options = {}) {
  const selectFn = options._select ?? select;
  return selectFn({
    message: 'Select a model:',
    choices: models.map((m) => ({ name: m.name, value: m.endpointId })),
  });
}

/**
 * Prompt the user for a text prompt. Validates non-empty input.
 * @param {{ _input?: Function }} [options] - Internal options for testing
 * @returns {Promise<string>} The entered text prompt
 */
export async function promptText(options = {}) {
  const inputFn = options._input ?? input;
  return inputFn({
    message: 'Enter your prompt:',
    validate: (value) => {
      if (!value.trim()) {
        return 'Prompt cannot be empty';
      }
      return true;
    },
  });
}

/**
 * Prompt the user to select an image size.
 * @param {string} defaultSize - Default size preset to pre-select
 * @param {{ _select?: Function }} [options] - Internal options for testing
 * @returns {Promise<string>} Selected size preset
 */
export async function promptSize(defaultSize, options = {}) {
  const selectFn = options._select ?? select;
  const sizes = [
    'landscape_4_3',
    'landscape_16_9',
    'square',
    'square_hd',
    'portrait_4_3',
    'portrait_16_9',
  ];

  return selectFn({
    message: 'Select image size:',
    choices: sizes.map((s) => ({ name: s, value: s })),
    default: defaultSize,
  });
}

/**
 * Ask the user if they want to generate another image.
 * @param {{ _confirm?: Function }} [options] - Internal options for testing
 * @returns {Promise<boolean>}
 */
export async function promptContinue(options = {}) {
  const confirmFn = options._confirm ?? confirm;
  return confirmFn({
    message: 'Generate another image?',
    default: true,
  });
}

/**
 * Ask the user if they want to keep the same model.
 * @param {{ _confirm?: Function }} [options] - Internal options for testing
 * @returns {Promise<boolean>}
 */
export async function promptKeepModel(options = {}) {
  const confirmFn = options._confirm ?? confirm;
  return confirmFn({
    message: 'Keep the same model?',
    default: true,
  });
}
