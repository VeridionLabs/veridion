import pino from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerConfig {
  name?: string;
  level?: LogLevel;
  pretty?: boolean;
  redact?: string[];
}

const createLogger = (config: LoggerConfig = {}) => {
  const { name = 'veridion', level = 'info', pretty = false, redact = [] } = config;

  const transport = pretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined;

  return pino({
    name,
    level,
    redact: {
      paths: ['password', 'token', 'secret', 'apiKey', ...redact],
      censor: '[REDACTED]',
    },
    transport,
  });
};

export const logger = createLogger({
  pretty: process.env.NODE_ENV !== 'production',
});

export { createLogger };
export type { Logger } from 'pino';
