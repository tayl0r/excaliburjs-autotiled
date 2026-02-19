import { describe, it, expect } from 'vitest';
import { SimpleAutotileMap } from '../../src/core/autotile-map.js';
import { resolveAllTiles, applyTerrainPaint } from '../../src/core/terrain-painter.js';
import { createGrassDirtWangSet, initMapTiles } from './test-helpers.js';

describe('SimpleAutotileMap serialization', () => {
  it('getColors() returns correct flat array', () => {
    const map = new SimpleAutotileMap(3, 2, 0);
    map.setColorAt(0, 0, 1);
    map.setColorAt(2, 0, 2);
    map.setColorAt(1, 1, 3);

    const colors = map.getColors();
    // row-major: [row0: (0,0) (1,0) (2,0), row1: (0,1) (1,1) (2,1)]
    expect(colors).toEqual([1, 0, 2, 0, 3, 0]);
  });

  it('getColors() returns a copy (not a reference)', () => {
    const map = new SimpleAutotileMap(2, 2, 1);
    const colors = map.getColors();
    colors[0] = 99;
    expect(map.colorAt(0, 0)).toBe(1);
  });

  it('importColors() sets colors and resets cells', () => {
    const map = new SimpleAutotileMap(2, 2, 1);
    const ws = createGrassDirtWangSet();

    // Paint some tiles to populate cells
    applyTerrainPaint(map, ws, 0, 0, 2);
    expect(map.cellAt(0, 0).tileId).toBeGreaterThanOrEqual(0);

    // Import new colors
    map.importColors([1, 2, 2, 1]);
    expect(map.colorAt(0, 0)).toBe(1);
    expect(map.colorAt(1, 0)).toBe(2);
    // Cells should be reset
    expect(map.cellAt(0, 0).tileId).toBe(-1);
  });

  it('importColors() throws on dimension mismatch', () => {
    const map = new SimpleAutotileMap(2, 2, 0);
    expect(() => map.importColors([1, 2, 3])).toThrow("doesn't match map dimensions");
    expect(() => map.importColors([1, 2, 3, 4, 5])).toThrow("doesn't match map dimensions");
  });
});

describe('resolveAllTiles', () => {
  it('resolves tiles from a color grid', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(3, 3, 0);

    // Set up a color pattern
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        map.setColorAt(x, y, x < 2 ? 1 : 2);
      }
    }

    // All cells should be empty before resolve
    expect(map.cellAt(0, 0).tileId).toBe(-1);

    resolveAllTiles(map, ws);

    // All painted cells should now have resolved tiles
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(map.cellAt(x, y).tileId).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('skips cells with color 0', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(2, 2, 0);
    map.setColorAt(0, 0, 1);
    // (1,0), (0,1), (1,1) remain color 0

    resolveAllTiles(map, ws);

    expect(map.cellAt(0, 0).tileId).toBeGreaterThanOrEqual(0);
    expect(map.cellAt(1, 1).tileId).toBe(-1);
  });
});

describe('round-trip persistence', () => {
  it('paint -> save -> clear -> load -> verify', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(4, 4, 0);
    initMapTiles(map, ws, 1);

    // Paint top-left quadrant as Dirt
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        applyTerrainPaint(map, ws, x, y, 2);
      }
    }

    // Save colors
    const savedColors = map.getColors();

    // Verify we have resolved tiles everywhere
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(map.cellAt(x, y).tileId).toBeGreaterThanOrEqual(0);
      }
    }

    // Load into a fresh map
    const freshMap = new SimpleAutotileMap(4, 4, 0);
    freshMap.importColors(savedColors);

    // Cells should be empty after import
    expect(freshMap.cellAt(0, 0).tileId).toBe(-1);

    // Resolve tiles from colors
    resolveAllTiles(freshMap, ws);

    // Verify colors match
    expect(freshMap.getColors()).toEqual(savedColors);

    // Verify all painted cells have resolved tiles
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(freshMap.cellAt(x, y).tileId).toBeGreaterThanOrEqual(0);
      }
    }

    // Verify the color pattern is correct
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(freshMap.colorAt(x, y)).toBe(map.colorAt(x, y));
      }
    }
  });
});
