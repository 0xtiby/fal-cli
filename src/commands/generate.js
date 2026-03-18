import { Cli, z } from 'incur';
import ora from 'ora';
import { loadConfig, resolveConfig, IMAGE_SIZE_PRESETS } from '../config.js';
import { runGeneration, extractOutputFiles, resolveImageUrl } from '../lib/fal-client.js';
import { saveFile } from '../lib/file-saver.js';
import { withErrorHandling } from '../lib/errors.js';

/**
 * @typedef {Object} GenerateResult
 * @property {string} model
 * @property {number} [seed]
 * @property {string} requestId
 * @property {string} [category]
 * @property {{ localPath: string, url: string, contentType: string, width?: number, height?: number }[]} files
 */

/**
 * Run the generate command handler.
 * @param {object} c - incur command context
 * @param {{ _deps?: object }} [testOptions] - Internal options for testing
 */
export async function runGenerateHandler(c, testOptions = {}) {
  const deps = {
    loadConfig,
    resolveConfig,
    resolveImageUrl,
    runGeneration,
    extractOutputFiles,
    saveFile,
    ora,
    stdout: process.stdout,
    stderr: process.stderr,
    exit: process.exit,
    processOn: process.on.bind(process),
    processRemoveListener: process.removeListener.bind(process),
    ...testOptions._deps,
  };

  const config = deps.loadConfig();
  const resolved = deps.resolveConfig(config, {
    outputDir: c.options.output,
    imageSize: c.options.size,
  });

  const model = c.options.model;
  const prompt = c.options.prompt;
  const seed = c.options.seed;
  const category = c.options.category;
  const verbose = resolved.verbose || c.options.verbose;

  // Flatten --image: split comma-separated values, then flatMap
  const rawImages = c.options.image ?? [];
  const images = rawImages.flatMap((v) => v.split(',').map((s) => s.trim()).filter(Boolean));

  // Resolve image URLs (upload local files)
  let imageUrls;
  if (images.length > 0) {
    const uploadSpinner = deps.ora({ text: 'Uploading image(s)...', stream: deps.stdout }).start();
    try {
      imageUrls = await Promise.all(images.map((s) => deps.resolveImageUrl(s)));
      uploadSpinner.succeed(`${imageUrls.length} image(s) ready`);
    } catch (err) {
      uploadSpinner.fail(`Failed to upload image: ${err.message}`);
      throw err;
    }
  }

  // Build generation input
  const genInput = { model, prompt, image_size: resolved.imageSize };
  if (seed !== undefined) genInput.seed = seed;
  if (imageUrls?.length) {
    genInput.image_url = imageUrls[0];
    genInput.image_urls = imageUrls;
  }

  // SIGINT handler
  const spinner = deps.ora({ text: 'Generating...', stream: deps.stdout }).start();
  const sigintHandler = () => {
    spinner.stop();
    deps.stderr.write('\n');
    deps.exit(0);
  };
  deps.processOn('SIGINT', sigintHandler);

  let genResult;
  try {
    const onStatus = (status) => {
      if (status.status === 'IN_QUEUE') {
        spinner.text = status.position != null
          ? `Queued (position ${status.position})...`
          : 'Queued...';
      } else if (status.status === 'IN_PROGRESS') {
        spinner.text = 'Generating...';
      }
    };

    genResult = await deps.runGeneration(genInput, onStatus);
  } catch (err) {
    spinner.stop();
    deps.processRemoveListener('SIGINT', sigintHandler);
    throw err;
  } finally {
    deps.processRemoveListener('SIGINT', sigintHandler);
  }

  // Extract output files
  const outputFiles = deps.extractOutputFiles(genResult.data);

  if (outputFiles.length === 0) {
    spinner.warn('No output files found in response');
    if (verbose) {
      deps.stderr.write('\nResponse:\n' + JSON.stringify(genResult.data, null, 2) + '\n');
    }
    return { model, requestId: genResult.requestId, files: [] };
  }

  // Save all files
  const needsSuffix = outputFiles.length > 1;
  const savedFiles = [];
  for (let i = 0; i < outputFiles.length; i++) {
    const file = outputFiles[i];
    const suffix = needsSuffix ? `_${String(i + 1).padStart(3, '0')}` : '';
    const { localPath, contentType } = await deps.saveFile(
      file.url, resolved.outputDir, model, { suffix }
    );
    savedFiles.push({
      localPath,
      url: file.url,
      contentType,
      ...(file.width !== undefined && { width: file.width }),
      ...(file.height !== undefined && { height: file.height }),
    });
  }

  spinner.succeed(`Saved ${savedFiles.length} file${savedFiles.length > 1 ? 's' : ''} to ${resolved.outputDir}/`);

  // Build result
  const result = {
    model,
    ...(genResult.data.seed !== undefined && { seed: genResult.data.seed }),
    requestId: genResult.requestId,
    ...(category && { category }),
    files: savedFiles,
  };

  // Human-readable summary
  const lines = [
    '',
    `  Model:     ${model}`,
  ];
  if (result.seed !== undefined) lines.push(`  Seed:      ${result.seed}`);
  lines.push(`  RequestId: ${result.requestId}`);
  lines.push('  Files:');
  for (const f of savedFiles) {
    const dims = f.width && f.height ? ` (${f.width}×${f.height})` : '';
    lines.push(`    ${f.localPath}${dims}`);
  }
  lines.push('');
  deps.stdout.write(lines.join('\n'));

  // Verbose output
  if (verbose) {
    deps.stderr.write('\nRequest:\n' + JSON.stringify(genInput, null, 2) + '\n');
    deps.stderr.write('\nResponse:\n' + JSON.stringify(genResult.data, null, 2) + '\n');
  }

  return result;
}

/**
 * Generate command — non-interactive generation for agents and scripts.
 */
export const generateCommand = Cli.create('generate', {
  description: 'Generate media from a prompt (agent-friendly)',
  options: z.object({
    model: z.string().describe('Model endpoint ID (e.g. fal-ai/flux/schnell)'),
    prompt: z.string().describe('Text prompt for generation'),
    image: z.string().array().optional().describe('Reference image: path, URL, data URI (data:image/png;base64,...), or - for stdin'),
    size: z.enum(IMAGE_SIZE_PRESETS).optional().describe('Image size preset'),
    output: z.string().optional().describe('Output directory'),
    seed: z.number().optional().describe('Seed for reproducible generation'),
    category: z.string().optional().describe('Category label (for documentation)'),
    verbose: z.boolean().optional().describe('Show full request/response'),
  }),
  run: withErrorHandling(async (c) => {
    return await runGenerateHandler(c);
  }),
});
