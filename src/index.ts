import { cli } from './cli.js';
import { logger } from './utils/logger.js';

process.on('uncaughtException', (err) => {
  logger.fatal(err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal(reason instanceof Error ? reason.message : String(reason));
  process.exit(1);
});

void cli(process.argv).catch((err: unknown) => {
  logger.fatal(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
