import { describe, it, expect } from 'vitest';
import { SDK } from './sdk';

describe('SDK', () => {
  it('should initialize without errors', () => {
    const sdk = new SDK();
    expect(sdk).toBeDefined();
  });
});