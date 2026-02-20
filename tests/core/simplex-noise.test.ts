import { describe, it, expect } from 'vitest';
import { SimplexNoise } from '../../src/core/simplex-noise.js';
import { SeededRandom } from '../../src/core/seeded-random.js';

describe('SimplexNoise', () => {
  it('returns values in [-1, 1]', () => {
    const noise = new SimplexNoise(new SeededRandom(42));
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        const v = noise.sample(x * 0.1, y * 0.1);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic for the same seed', () => {
    const a = new SimplexNoise(new SeededRandom(42));
    const b = new SimplexNoise(new SeededRandom(42));
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        expect(a.sample(x * 0.05, y * 0.05)).toBe(b.sample(x * 0.05, y * 0.05));
      }
    }
  });

  it('different seeds produce different output', () => {
    const a = new SimplexNoise(new SeededRandom(1));
    const b = new SimplexNoise(new SeededRandom(2));
    let diffs = 0;
    for (let i = 0; i < 100; i++) {
      if (a.sample(i * 0.1, i * 0.1) !== b.sample(i * 0.1, i * 0.1)) diffs++;
    }
    expect(diffs).toBeGreaterThan(50);
  });

  it('varies spatially (not constant)', () => {
    const noise = new SimplexNoise(new SeededRandom(42));
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) {
      values.add(Math.round(noise.sample(i * 0.3, i * 0.3) * 100));
    }
    expect(values.size).toBeGreaterThan(10);
  });
});
