import { describe, expect, it } from 'vitest';

import { FindingSeverity } from '../enums';
import { calculateScore, formatAddress, slugify } from './index';

describe('calculateScore', () => {
  it('should return 100 for no findings', () => {
    expect(calculateScore([])).toBe(100);
  });

  it('should return lower score for critical findings', () => {
    const score = calculateScore([
      { severity: FindingSeverity.CRITICAL },
      { severity: FindingSeverity.HIGH },
    ]);
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThan(0);
  });

  it('should penalize more for critical than gas', () => {
    const criticalScore = calculateScore([{ severity: FindingSeverity.CRITICAL }]);
    const gasScore = calculateScore([{ severity: FindingSeverity.GAS }]);
    expect(criticalScore).toBeLessThan(gasScore);
  });
});

describe('slugify', () => {
  it('should convert to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('should handle special characters', () => {
    expect(slugify('Test @#$ Contract!')).toBe('test-contract');
  });
});

describe('formatAddress', () => {
  it('should truncate long addresses', () => {
    const result = formatAddress('0x1234567890abcdef1234567890abcdef12345678');
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(44);
  });

  it('should not truncate short addresses', () => {
    const result = formatAddress('0x1234');
    expect(result).toBe('0x1234');
  });
});
