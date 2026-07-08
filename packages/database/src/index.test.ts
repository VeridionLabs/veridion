import { describe, expect, it } from 'vitest';

describe('Database Module', () => {
  it('should be importable', async () => {
    const mod = await import('./index');
    expect(mod).toBeDefined();
  });
});
