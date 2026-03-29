/**
 * Logger interface for the Cheqi SDK. Compatible with console, pino, winston, bunyan, etc.
 * Supply your own implementation via {@link CheqiSDKBuilder.logger} or use the built-in
 * {@link ConsoleLogger} (default) / {@link NoopLogger}.
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Default logger that writes to the console. Used when no custom logger is supplied.
 */
export class ConsoleLogger implements Logger {
  constructor(private readonly prefix: string = "CheqiSDK") {}

  debug(message: string, ...args: unknown[]): void {
    console.debug(`[${this.prefix}] ${message}`, ...args);
  }
  info(message: string, ...args: unknown[]): void {
    console.info(`[${this.prefix}] ${message}`, ...args);
  }
  warn(message: string, ...args: unknown[]): void {
    console.warn(`[${this.prefix}] ${message}`, ...args);
  }
  error(message: string, ...args: unknown[]): void {
    console.error(`[${this.prefix}] ${message}`, ...args);
  }
}

/**
 * Silent logger that discards all messages. Useful for tests or when logging is unwanted.
 */
export class NoopLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}
