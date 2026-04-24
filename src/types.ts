export type ProjectType = 'next' | 'nuxt' | 'supervisor' | 'socket';

export interface ParsedArgs {
  type?: ProjectType;
  dir?: string;
  port?: number;
  auto?: boolean;
}

export interface GlobalFlags {
  dryRun: boolean;
  verbose: boolean;
  yes: boolean;
  user?: string;
  name?: string;
  domain?: string;
  noHealthcheck: boolean;
  /** Skip `chown -R user:user projectDir` after deploy (default: run when root). */
  noChown: boolean;
  configPath?: string;
}

export interface ResolvedContext {
  type: ProjectType;
  dir: string;
  port?: number;
  user: string;
  name: string;
  domain?: string;
  isRestart: boolean;
  flags: GlobalFlags;
  config: GlobalConfig;
}

export interface PM2AppEntry {
  name: string;
  script: string;
  /** CLI args passed to the script (e.g. "start" for `next start`). */
  args?: string;
  /** Some ecosystem entries omit cwd; PM2 defaults to the script directory. */
  cwd?: string;
  exec_mode: 'cluster' | 'fork';
  instances?: number;
  env: Record<string, string>;
}

export interface ProcessJson {
  apps: PM2AppEntry[];
}

export interface GlobalConfig {
  processJsonPath: string;
  supervisordConfPath: string;
  defaultUser?: string;
  healthcheck: { retries: number; delayMs: number; timeoutMs: number };
}

export interface ProjectYaml {
  name?: string;
  type?: ProjectType;
  port?: number;
  env?: Record<string, string>;
}
