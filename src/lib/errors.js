/** @typedef {Object} CLIError
 * @property {string} code - Error code (e.g. "CONFIG_ERROR", "API_ERROR", "NETWORK_ERROR")
 * @property {string} message - Human-readable error message
 * @property {number} [status] - HTTP status code if applicable
 * @property {Object} [details] - Additional debug info (shown with --verbose)
 */

/** @type {Object.<string, number>} Error code to exit code mapping */
export const EXIT_CODES = {
  CONFIG_ERROR: 2,
  API_ERROR: 3,
  NETWORK_ERROR: 4,
};

/**
 * Format and print an error, then exit with the appropriate code.
 * Respects --json and --verbose flags.
 *
 * @param {CLIError} error
 * @param {{ json?: boolean, verbose?: boolean }} [options]
 */
export function handleError(error, options = {}) {
  const exitCode = EXIT_CODES[error.code] ?? 1;

  if (options.json) {
    const output = { error: { code: error.code, message: error.message } };
    if (error.status !== undefined) {
      output.error.status = error.status;
    }
    process.stdout.write(JSON.stringify(output) + '\n');
  } else {
    process.stderr.write(`✗ Error: ${error.message}\n`);

    if (options.verbose && error.details) {
      const { url, status, response } = error.details;
      if (url) process.stderr.write(`\n  URL:      ${url}\n`);
      if (status) process.stderr.write(`  Status:   ${status}\n`);
      if (response) process.stderr.write(`  Response: ${response}\n`);
    }
  }

  process.exit(exitCode);
}

/**
 * Wrap an async command handler with consistent error handling.
 *
 * @param {Function} handler - The command's action function
 * @returns {Function} Wrapped handler that catches errors and calls handleError
 */
export function withErrorHandling(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      // If it's already a CLIError (has a code property matching our codes)
      if (err && err.code && (EXIT_CODES[err.code] !== undefined)) {
        handleError(err, extractOptions(args));
      } else {
        // Wrap generic errors
        handleError(
          { code: 'GENERAL_ERROR', message: err?.message ?? String(err) },
          extractOptions(args),
        );
      }
    }
  };
}

/**
 * Try to extract options (json/verbose) from handler arguments.
 * incur passes options as the last argument to command handlers.
 * @param {any[]} args
 * @returns {{ json?: boolean, verbose?: boolean }}
 */
function extractOptions(args) {
  const last = args[args.length - 1];
  if (last && typeof last === 'object' && !Array.isArray(last)) {
    return { json: last.json, verbose: last.verbose };
  }
  return {};
}
