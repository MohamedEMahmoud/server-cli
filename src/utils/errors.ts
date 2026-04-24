export class ServerCliError extends Error {
  readonly hint?: string;
  readonly code: number;
  constructor(message: string, opts: { hint?: string; code?: number } = {}) {
    super(message);
    this.name = 'ServerCliError';
    this.hint = opts.hint;
    this.code = opts.code ?? 1;
  }
}
