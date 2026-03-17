#!/usr/bin/env node

import { Cli } from 'incur';
import { loadConfig, initFalClient } from './config.js';
import { withErrorHandling } from './lib/errors.js';
import { modelsCommand } from './commands/models.js';

const run = withErrorHandling(async () => {
  const config = loadConfig();
  initFalClient(config);

  const cli = Cli.create('fal-cli', {
    description: 'Generate and edit images via fal.ai',
    version: '0.1.0',
  });

  cli.command(modelsCommand);

  await cli.serve();
});

run();
