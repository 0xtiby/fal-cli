import { Cli, z } from 'incur';
import { listModels, listCategories } from '../lib/fal-client.js';
import { withErrorHandling } from '../lib/errors.js';

/**
 * Models command group — list and search fal.ai models.
 */
export const modelsCommand = Cli.create('models', {
  description: 'List and search available fal.ai models',
})
  .command('list', {
    description: 'List available models',
    options: z.object({
      category: z.string().optional().describe('Filter by category'),
    }),
    run: withErrorHandling(async (c) => {
      const models = await listModels(
        c.options.category ? { category: c.options.category } : undefined,
      );

      if (models.length === 0) {
        const msg = c.options.category
          ? `No models found for category '${c.options.category}'. Run \`models categories\` to see available categories.`
          : 'No models found.';
        return { models: [], message: msg };
      }

      return { models };
    }),
  })
  .command('categories', {
    description: 'List available model categories',
    run: withErrorHandling(async () => {
      const categories = await listCategories();
      return { categories };
    }),
  });
