import { describe, expect, it } from 'vitest';

import { cn, formatAddress, severityColor } from './utils';

describe('cn', () => {
  it('should merge class names', () => {
    const result = cn('px-4', 'py-2', 'text-sm');
    expect(result).toContain('px-4');
    expect(result).toContain('py-2');
    expect(result).toContain('text-sm');
  });

  it('should handle conditional classes', () => {
    const result = cn('base', false && 'hidden', 'visible');
    expect(result).toContain('base');
    expect(result).toContain('visible');
    expect(result).not.toContain('hidden');
  });
});

describe('formatAddress', () => {
  it('should truncate long addresses', () => {
    const result = formatAddress('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(44);
  });
});

describe('severityColor', () => {
  it('should return color class for CRITICAL', () => {
    const result = severityColor('CRITICAL');
    expect(result).toContain('text-red-500');
  });

  it('should return color class for HIGH', () => {
    const result = severityColor('HIGH');
    expect(result).toContain('text-orange-500');
  });
});
