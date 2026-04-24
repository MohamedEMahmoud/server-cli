import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import type { GlobalConfig, GlobalFlags, ProjectYaml } from '../types.js';
import { exists, readJson } from '../utils/fs.js';

const defaults: GlobalConfig = {
  processJsonPath: '/root/Scripts/process.json',
  supervisordConfPath: '/etc/supervisord.conf',
  healthcheck: { retries: 3, delayMs: 2000, timeoutMs: 5000 },
};

function mergeHealth(
  a: GlobalConfig['healthcheck'],
  b?: Partial<GlobalConfig['healthcheck']>,
): GlobalConfig['healthcheck'] {
  return { ...a, ...b };
}

export async function loadConfig(
  flags: GlobalFlags,
  projectDir: string,
): Promise<{ config: GlobalConfig; project?: ProjectYaml }> {
  const cfgPath = flags.configPath ?? path.join(os.homedir(), '.server-cli', 'config.json');
  let cfg: GlobalConfig = {
    ...defaults,
    healthcheck: { ...defaults.healthcheck },
  };

  if (await exists(cfgPath)) {
    try {
      const file = await readJson<Partial<GlobalConfig>>(cfgPath);
      cfg = {
        ...cfg,
        ...file,
        healthcheck: mergeHealth(cfg.healthcheck, file.healthcheck),
      };
    } catch {
      // ignore malformed global config
    }
  }

  let project: ProjectYaml | undefined;
  const yamlPath = path.join(projectDir, 'server.yaml');
  if (await exists(yamlPath)) {
    try {
      const raw = await fs.readFile(yamlPath, 'utf8');
      project = YAML.parse(raw) as ProjectYaml;
    } catch {
      // ignore
    }
  }

  return { config: cfg, project };
}
