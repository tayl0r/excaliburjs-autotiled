import { describe, it, expect } from 'vitest';
import { SeededRandom } from '../../src/core/seeded-random.js';

describe('SeededRandom', () => {
  it('produces deterministic sequence from same seed', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces values in [0, 1)', () => {
    const rng = new SeededRandom(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds produce different sequences', () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next());
    expect(same.some(v => !v)).toBe(true);
  });

  it('nextInt(min, max) returns integers in [min, max)', () => {
    const rng = new SeededRandom(99);
    for (let i = 0; i < 200; i++) {
      const v = rng.nextInt(3, 10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(10);
    }
  });
});
