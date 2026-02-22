import { describe, it, expect } from 'vitest';
import { generateNoise, generateVoronoi, generateZones, generateMap, sprinkleVariety } from '../../src/core/map-generator.js';
import { SimpleAutotileMap } from '../../src/core/autotile-map.js';
import { createGrassDirtWangSet, createThreeColorWangSet } from './test-helpers.js';
import { NEIGHBOR_OFFSETS } from '../../src/core/wang-id.js';
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

describe('generateZones', () => {
  // zoneColors: [center, NW, NE, SW, SE]
  const fiveZones = [1, 2, 3, 2, 3];

  it('returns array of correct length', () => {
    const result = generateZones(60, 40, fiveZones, { seed: 42 });
    expect(result).toHaveLength(60 * 40);
  });

  it('places correct primary colors in zone areas', () => {
    const w = 60, h = 60;
    const zoneColors = [1, 2, 3, 2, 3]; // center=1, NW=2, NE=3, SW=2, SE=3
    const result = generateZones(w, h, zoneColors, { seed: 42, boundaryNoise: 0 });

    // With boundaryNoise=0, center is a diamond, corners are quadrants.
    // Map center (30, 30) should be the center zone
    expect(result[30 * w + 30]).toBe(1);
    // NW corner area (5, 5)
    expect(result[5 * w + 5]).toBe(2);
    // NE corner area (55, 5)
    expect(result[5 * w + 55]).toBe(3);
    // SW corner area (5, 55)
    expect(result[55 * w + 5]).toBe(2);
    // SE corner area (55, 55)
    expect(result[55 * w + 55]).toBe(3);
  });

  it('boundaries are noise-perturbed when boundaryNoise > 0', () => {
    const w = 60, h = 60;
    const straight = generateZones(w, h, fiveZones, { seed: 42, boundaryNoise: 0 });
    const perturbed = generateZones(w, h, fiveZones, { seed: 42, boundaryNoise: 0.5 });
    expect(perturbed).not.toEqual(straight);
  });

  it('is deterministic for the same seed', () => {
    const a = generateZones(40, 40, fiveZones, { seed: 99 });
    const b = generateZones(40, 40, fiveZones, { seed: 99 });
    expect(a).toEqual(b);
  });

  it('different seeds produce different output', () => {
    const a = generateZones(40, 40, fiveZones, { seed: 1 });
    const b = generateZones(40, 40, fiveZones, { seed: 2 });
    expect(a).not.toEqual(b);
  });
});

describe('sprinkleVariety', () => {
  it('amount 0 produces no changes', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(20, 20, 0);
    // Fill with color 1
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        map.setColorAt(x, y, 1);
      }
    }
    const before = map.getColors().slice();
    sprinkleVariety(map, ws, { seed: 42, amount: 0 });
    expect(map.getColors()).toEqual(before);
  });

  it('amount > 0 produces some changes on a uniform map', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(30, 30, 0);
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        map.setColorAt(x, y, 1);
      }
    }
    const before = map.getColors().slice();
    sprinkleVariety(map, ws, { seed: 42, amount: 0.5 });
    // Some cells should have changed
    expect(map.getColors()).not.toEqual(before);
  });

  it('sprinkled cells are distance 1 from their original color', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(30, 30, 0);
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        map.setColorAt(x, y, 1);
      }
    }
    sprinkleVariety(map, ws, { seed: 42, amount: 0.5 });
    // Any changed cell must be distance 1 from the original (Grass=1)
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        const c = map.colorAt(x, y);
        if (c !== 1) {
          expect(ws.colorDistance(1, c)).toBe(1);
        }
      }
    }
  });

  it('all adjacent cell pairs have colorDistance <= 1 after sprinkle', () => {
    const ws = createThreeColorWangSet();
    const map = new SimpleAutotileMap(30, 30, 0);
    // Fill with color 1 (Grass, the hub)
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        map.setColorAt(x, y, 1);
      }
    }
    sprinkleVariety(map, ws, { seed: 42, amount: 0.5 });

    // Verify safety: no adjacent pair with distance > 1
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        const c = map.colorAt(x, y);
        if (c === 0) continue;
        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= 30 || ny < 0 || ny >= 30) continue;
          const nc = map.colorAt(nx, ny);
          if (nc === 0) continue;
          expect(ws.colorDistance(c, nc)).toBeLessThanOrEqual(1);
        }
      }
    }
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

  it('works with zones algorithm', () => {
    const ws = createGrassDirtWangSet();
    const result = generateMap({
      algorithm: 'zones',
      width: 30,
      height: 20,
      seed: 42,
      biomes: [],
      zoneBiomes: [1, 2, 1, 2, 1],
      boundaryNoise: 0.5,
    }, ws);
    expect(result).toHaveLength(30 * 20);
    for (const c of result) {
      expect(c).toBeGreaterThan(0);
    }
  });

  it('zones algorithm: all adjacent pairs have colorDistance <= 1', () => {
    const ws = createThreeColorWangSet();
    const w = 40, h = 30;
    const result = generateMap({
      algorithm: 'zones',
      width: w,
      height: h,
      seed: 42,
      biomes: [],
      zoneBiomes: [1, 2, 3, 3, 1],
      boundaryNoise: 0.5,
      sprinkle: 0.15,
    }, ws);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = result[y * w + x];
        if (c === 0) continue;
        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nc = result[ny * w + nx];
          if (nc === 0) continue;
          expect(ws.colorDistance(c, nc)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('sprinkle: 0 disables variety', () => {
    const ws = createGrassDirtWangSet();
    const resultNoSprinkle = generateMap({
      algorithm: 'zones',
      width: 30,
      height: 20,
      seed: 42,
      biomes: [],
      zoneBiomes: [1, 1, 1, 1, 1],
      boundaryNoise: 0,
      sprinkle: 0,
    }, ws);
    // All cells should be the same color (uniform zones, no sprinkle)
    const unique = new Set(resultNoSprinkle);
    expect(unique.size).toBe(1);
    expect(unique.has(1)).toBe(true);
  });
});
