import { runNpm } from '../utils/exec.js';
import type { GlobalFlags } from '../types.js';

export async function runSelfUpdate(flags: GlobalFlags): Promise<void> {
  await runNpm(['i', '-g', '@node-software-ts/server-cli@latest'], {
    dryRun: flags.dryRun,
    verbose: flags.verbose,
  });
}
