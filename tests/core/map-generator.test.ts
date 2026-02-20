import { describe, it, expect } from 'vitest';
import { generateNoise, generateVoronoi, generateMap } from '../../src/core/map-generator.js';
import { createGrassDirtWangSet } from './test-helpers.js';
import type { BiomeConfig } from '../../src/core/map-generator.js';

const twoBiomes: BiomeConfig[] = [
  { colorId: 1, weight: 1 },
  { colorId: 2, weight: 1 },
];

const threeBiomes: BiomeConfig[] = [
  { colorId: 1, weight: 1 },
  { colorId: 2, weight: 2 },
  { colorId: 3, weight: 1 },
];

describe('generateNoise', () => {
  it('returns array of length width * height', () => {
    const result = generateNoise(20, 15, twoBiomes, { seed: 42 });
    expect(result).toHaveLength(20 * 15);
  });

  it('only contains biome color IDs', () => {
    const result = generateNoise(30, 30, threeBiomes, { seed: 42 });
    const validIds = new Set([1, 2, 3]);
    for (const c of result) {
      expect(validIds.has(c)).toBe(true);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = generateNoise(25, 25, twoBiomes, { seed: 99 });
    const b = generateNoise(25, 25, twoBiomes, { seed: 99 });
    expect(a).toEqual(b);
  });

  it('different seeds produce different output', () => {
    const a = generateNoise(25, 25, twoBiomes, { seed: 1 });
    const b = generateNoise(25, 25, twoBiomes, { seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('respects weight ratios approximately (highest weight gets most cells)', () => {
    const biomes: BiomeConfig[] = [
      { colorId: 1, weight: 1 },
      { colorId: 2, weight: 4 },
    ];
    const result = generateNoise(50, 50, biomes, { seed: 42 });
    const count1 = result.filter(c => c === 1).length;
    const count2 = result.filter(c => c === 2).length;
    // colorId 2 has 4x weight, so it should have substantially more cells
    expect(count2).toBeGreaterThan(count1);
  });
});

describe('generateVoronoi', () => {
  it('returns array of length width * height', () => {
    const result = generateVoronoi(20, 15, twoBiomes, { seed: 42 });
    expect(result).toHaveLength(20 * 15);
  });

  it('only contains biome color IDs', () => {
    const result = generateVoronoi(30, 30, threeBiomes, { seed: 42 });
    const validIds = new Set([1, 2, 3]);
    for (const c of result) {
      expect(validIds.has(c)).toBe(true);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = generateVoronoi(25, 25, twoBiomes, { seed: 99 });
    const b = generateVoronoi(25, 25, twoBiomes, { seed: 99 });
    expect(a).toEqual(b);
  });

  it('uses all biome colors when point count is sufficient', () => {
    const result = generateVoronoi(40, 40, threeBiomes, { seed: 42, pointCount: 50 });
    const usedColors = new Set(result);
    expect(usedColors.has(1)).toBe(true);
    expect(usedColors.has(2)).toBe(true);
    expect(usedColors.has(3)).toBe(true);
  });
});

describe('generateMap', () => {
  it('returns correct length', () => {
    const ws = createGrassDirtWangSet();
    const result = generateMap({
      algorithm: 'noise',
      width: 20,
      height: 15,
      seed: 42,
      biomes: [
        { colorId: 1, weight: 1 },
        { colorId: 2, weight: 1 },
      ],
    }, ws);
    expect(result).toHaveLength(20 * 15);
  });

  it('all values > 0 (no empty cells)', () => {
    const ws = createGrassDirtWangSet();
    const result = generateMap({
      algorithm: 'noise',
      width: 20,
      height: 15,
      seed: 42,
      biomes: [
        { colorId: 1, weight: 1 },
        { colorId: 2, weight: 1 },
      ],
    }, ws);
    for (const c of result) {
      expect(c).toBeGreaterThan(0);
    }
  });

  it('works with voronoi algorithm', () => {
    const ws = createGrassDirtWangSet();
    const result = generateMap({
      algorithm: 'voronoi',
      width: 20,
      height: 15,
      seed: 42,
      biomes: [
        { colorId: 1, weight: 1 },
        { colorId: 2, weight: 1 },
      ],
      pointCount: 10,
    }, ws);
    expect(result).toHaveLength(20 * 15);
    for (const c of result) {
      expect(c).toBeGreaterThan(0);
    }
  });
});
