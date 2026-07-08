import { describe, expect, it } from 'vitest';

import { VeridionClient } from './client';

describe('VeridionClient', () => {
  it('should construct with base URL', () => {
    const client = new VeridionClient({ baseUrl: 'https://api.veridion.dev' });
    expect(client).toBeDefined();
  });
});
