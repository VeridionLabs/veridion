import { describe, it, expect } from 'vitest';
import { createLogger, logger } from './index';

describe('Logger', () => {
  it('should export a logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('should create a custom logger', () => {
    const custom = createLogger({ name: 'test', level: 'debug' });
    expect(custom).toBeDefined();
    expect(typeof custom.info).toBe('function');
  });
});
