import { describe, it, expect } from 'vitest';
import * as api from '../src/index';

describe('index exports', () => {
  it('has expected exports', () => {
    expect(api).toHaveProperty('TableProxy');
    expect(api).toHaveProperty('SessionDO');
    expect(api).toHaveProperty('verifyAccess');
    expect(api).toHaveProperty('encrypt');
    expect(api).toHaveProperty('decrypt');
  });
});
