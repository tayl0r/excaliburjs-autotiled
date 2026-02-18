import { describe, it, expect } from 'vitest';
import { SimpleAutotileMap } from '../../src/core/autotile-map.js';
import { WangSet } from '../../src/core/wang-set.js';
import { WangId } from '../../src/core/wang-id.js';
import { WangColor } from '../../src/core/wang-color.js';
import { generateAllVariants } from '../../src/core/variant-generator.js';
import { computeColorDistances } from '../../src/core/color-distance.js';
import { applyTerrainPaint } from '../../src/core/terrain-painter.js';
import { floodFillTerrain } from '../../src/core/flood-fill.js';
import { DEFAULT_TRANSFORMATIONS } from '../../src/core/metadata-schema.js';

// Helper: create a 2-color corner WangSet with 16 tiles
function createGrassDirtWangSet(): WangSet {
  const grass: WangColor = { id: 1, name: 'Grass', color: '#00ff00', imageTileId: 0, probability: 1.0 };
  const dirt: WangColor = { id: 2, name: 'Dirt', color: '#8b4513', imageTileId: 15, probability: 1.0 };
  const ws = new WangSet('Ground', 'corner', [grass, dirt]);

  for (let n = 0; n < 16; n++) {
    const tl = (n & 8) ? 2 : 1;
    const tr = (n & 4) ? 2 : 1;
    const br = (n & 2) ? 2 : 1;
    const bl = (n & 1) ? 2 : 1;
    ws.addTileMapping(0, n, WangId.fromArray([0, tr, 0, br, 0, bl, 0, tl]));
  }

  ws.setVariants(generateAllVariants(ws, DEFAULT_TRANSFORMATIONS));
  const { distances, nextHop } = computeColorDistances(ws);
  ws.setDistanceMatrix(distances);
  ws.setNextHopMatrix(nextHop);
  return ws;
}

// Helper: create 3-color WangSet (Grass=1, Dirt=2, Sand=3)
function createThreeColorWangSet(): WangSet {
  const grass: WangColor = { id: 1, name: 'Grass', color: '#00ff00', imageTileId: 0, probability: 1.0 };
  const dirt: WangColor = { id: 2, name: 'Dirt', color: '#8b4513', imageTileId: 15, probability: 1.0 };
  const sand: WangColor = { id: 3, name: 'Sand', color: '#f4e242', imageTileId: 31, probability: 1.0 };
  const ws = new WangSet('Ground', 'corner', [grass, dirt, sand]);

  for (let n = 0; n < 16; n++) {
    const tl = (n & 8) ? 2 : 1;
    const tr = (n & 4) ? 2 : 1;
    const br = (n & 2) ? 2 : 1;
    const bl = (n & 1) ? 2 : 1;
    ws.addTileMapping(0, n, WangId.fromArray([0, tr, 0, br, 0, bl, 0, tl]));
  }
  for (let n = 0; n < 16; n++) {
    const tl = (n & 8) ? 3 : 1;
    const tr = (n & 4) ? 3 : 1;
    const br = (n & 2) ? 3 : 1;
    const bl = (n & 1) ? 3 : 1;
    ws.addTileMapping(0, 16 + n, WangId.fromArray([0, tr, 0, br, 0, bl, 0, tl]));
  }

  ws.setVariants(generateAllVariants(ws, DEFAULT_TRANSFORMATIONS));
  const { distances, nextHop } = computeColorDistances(ws);
  ws.setDistanceMatrix(distances);
  ws.setNextHopMatrix(nextHop);
  return ws;
}

/** Initialize all tiles on a map with a given color */
function initMap(map: SimpleAutotileMap, ws: WangSet, color: number): void {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      applyTerrainPaint(map, ws, x, y, color);
    }
  }
}

describe('floodFillTerrain', () => {
  it('fill same color → re-resolves tiles', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(5, 5, 1);
    initMap(map, ws, 1);

    const affected = floodFillTerrain(map, ws, 2, 2, 1);
    // Same-color fill still runs the autotiler to re-randomize tiles
    expect(affected.length).toBeGreaterThan(0);
    // All cells should still be color 1
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        expect(map.colorAt(x, y)).toBe(1);
      }
    }
  });

  it('fill empty cell (color 0) → no-op', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(5, 5, 0); // all empty

    const affected = floodFillTerrain(map, ws, 2, 2, 2);
    expect(affected).toEqual([]);
  });

  it('fill single isolated cell → fills just that cell + recomputes neighbors', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(5, 5, 1);
    initMap(map, ws, 1);

    // Paint a single dirt cell
    applyTerrainPaint(map, ws, 2, 2, 2);

    // Flood fill that single dirt cell back to grass
    const affected = floodFillTerrain(map, ws, 2, 2, 1);
    expect(affected.length).toBeGreaterThan(0);
    expect(map.colorAt(2, 2)).toBe(1);
  });

  it('fill connected 3x3 region → all 9 cells change', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(7, 7, 1);
    initMap(map, ws, 1);

    // Paint a 3x3 dirt region
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) {
        applyTerrainPaint(map, ws, x, y, 2);
      }
    }

    // Verify the center is dirt
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) {
        expect(map.colorAt(x, y)).toBe(2);
      }
    }

    // Flood fill the dirt region to grass
    floodFillTerrain(map, ws, 3, 3, 1);

    // All 9 cells should now be grass
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) {
        expect(map.colorAt(x, y)).toBe(1);
      }
    }
  });

  it('fill respects color boundaries (doesn\'t cross to other colors)', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(5, 5, 1);
    initMap(map, ws, 1);

    // Paint dirt in top-left 2x2
    applyTerrainPaint(map, ws, 0, 0, 2);
    applyTerrainPaint(map, ws, 1, 0, 2);
    applyTerrainPaint(map, ws, 0, 1, 2);
    applyTerrainPaint(map, ws, 1, 1, 2);

    // Paint dirt in bottom-right 2x2
    applyTerrainPaint(map, ws, 3, 3, 2);
    applyTerrainPaint(map, ws, 4, 3, 2);
    applyTerrainPaint(map, ws, 3, 4, 2);
    applyTerrainPaint(map, ws, 4, 4, 2);

    // Fill top-left dirt region → should only change those 4 cells, not the bottom-right
    floodFillTerrain(map, ws, 0, 0, 1);

    // Top-left should now be grass
    expect(map.colorAt(0, 0)).toBe(1);
    expect(map.colorAt(1, 0)).toBe(1);
    expect(map.colorAt(0, 1)).toBe(1);
    expect(map.colorAt(1, 1)).toBe(1);

    // Bottom-right should still be dirt
    expect(map.colorAt(3, 3)).toBe(2);
    expect(map.colorAt(4, 3)).toBe(2);
    expect(map.colorAt(3, 4)).toBe(2);
    expect(map.colorAt(4, 4)).toBe(2);
  });

  it('fill at map edge → no crash', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(3, 3, 1);
    initMap(map, ws, 1);

    // Fill at corner
    const affected = floodFillTerrain(map, ws, 0, 0, 2);
    expect(affected.length).toBeGreaterThan(0);
    // All cells should be filled since they're all connected grass
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(map.colorAt(x, y)).toBe(2);
      }
    }
  });

  it('fill out of bounds → no-op', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(3, 3, 1);

    const affected = floodFillTerrain(map, ws, -1, 0, 2);
    expect(affected).toEqual([]);
  });

  it('fill with intermediate insertion at boundary (distance > 1)', () => {
    const ws = createThreeColorWangSet();
    const map = new SimpleAutotileMap(5, 5, 2); // all dirt
    initMap(map, ws, 2);

    // Paint sand in center 3 cells (vertical line)
    applyTerrainPaint(map, ws, 2, 1, 3);
    applyTerrainPaint(map, ws, 2, 2, 3);
    applyTerrainPaint(map, ws, 2, 3, 3);

    // Fill the sand line back to dirt — sand→dirt distance is 2, needs grass intermediate
    floodFillTerrain(map, ws, 2, 2, 2);

    // The filled cells should now be dirt
    expect(map.colorAt(2, 1)).toBe(2);
    expect(map.colorAt(2, 2)).toBe(2);
    expect(map.colorAt(2, 3)).toBe(2);
  });
});
