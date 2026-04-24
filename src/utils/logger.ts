import chalk from 'chalk';

let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

function ts(): string {
  return new Date().toISOString();
}

function prefix(): string {
  return verbose ? `${chalk.dim(`[${ts()}]`)} ` : '';
}

export const logger = {
  dim(text: string): void {
    console.log(prefix() + chalk.dim(text));
  },
  info(text: string): void {
    console.log(prefix() + text);
  },
  warn(text: string): void {
    console.warn(prefix() + chalk.yellow(text));
  },
  error(text: string): void {
    console.error(prefix() + chalk.red(text));
  },
  fatal(text: string): void {
    console.error(prefix() + chalk.red.bold(text));
  },
  success(text: string): void {
    console.log(prefix() + chalk.green(text));
  },
  step(current: number, total: number, text: string): void {
    console.log(prefix() + chalk.cyan(`[${current}/${total}] ${text}`));
  },
};
