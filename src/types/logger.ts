// This is homebridge's `lib/logger.js`

export type LogFunction = (msg: string, ...params: any[]) => void;
export type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger extends LogFunction {
  debug: LogFunction;
  info: LogFunction;
  warn: LogFunction;
  error: LogFunction;

  log: (level: Level, msg: string, ...params: any[]) => void;
}
