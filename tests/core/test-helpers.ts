import { WangId } from '../../src/core/wang-id.js';
import { WangSet } from '../../src/core/wang-set.js';
import type { WangColor } from '../../src/core/wang-color.js';
import { SimpleAutotileMap } from '../../src/core/autotile-map.js';
import { generateAllVariants } from '../../src/core/variant-generator.js';
import { computeColorDistances } from '../../src/core/color-distance.js';
import { applyTerrainPaint } from '../../src/core/terrain-painter.js';
import { DEFAULT_TRANSFORMATIONS } from '../../src/core/metadata-schema.js';

export function makeColor(id: number, name: string): WangColor {
  return { id, name, color: '#000000', imageTileId: -1, tilesetIndex: 0, probability: 1.0 };
}

/**
 * Generate 16 corner tiles for a 2-color pair using standard binary layout:
 * N = TL(bit3) TR(bit2) BR(bit1) BL(bit0), where 0=colorA, 1=colorB.
 */
export function addCornerTilePair(
  ws: WangSet,
  colorA: number,
  colorB: number,
  startTileId = 0,
  tilesetIndex = 0,
): void {
  for (let n = 0; n < 16; n++) {
    const tl = (n & 8) ? colorB : colorA;
    const tr = (n & 4) ? colorB : colorA;
    const br = (n & 2) ? colorB : colorA;
    const bl = (n & 1) ? colorB : colorA;
    ws.addTileMapping(tilesetIndex, startTileId + n, WangId.fromArray([0, tr, 0, br, 0, bl, 0, tl]));
  }
}

/** Compute variants and color distances, finishing WangSet initialization. */
export function finalizeWangSet(ws: WangSet): void {
  ws.setVariants(generateAllVariants(ws, DEFAULT_TRANSFORMATIONS));
  const { distances, nextHop } = computeColorDistances(ws);
  ws.setDistanceMatrix(distances);
  ws.setNextHopMatrix(nextHop);
}

/**
 * Create a fully initialized 2-color corner WangSet with 16 tiles.
 * Uses standard binary layout: N = TL(bit3) TR(bit2) BR(bit1) BL(bit0),
 * where 0=Grass(1), 1=Dirt(2).
 */
export function createGrassDirtWangSet(): WangSet {
  const grass: WangColor = { id: 1, name: 'Grass', color: '#00ff00', imageTileId: 0, tilesetIndex: 0, probability: 1.0 };
  const dirt: WangColor = { id: 2, name: 'Dirt', color: '#8b4513', imageTileId: 15, tilesetIndex: 0, probability: 1.0 };
  const ws = new WangSet('Ground', 'corner', [grass, dirt]);
  addCornerTilePair(ws, 1, 2);
  finalizeWangSet(ws);
  return ws;
}

/**
 * Create a fully initialized 3-color corner WangSet (Grass=1, Dirt=2, Sand=3).
 * Only Grass+Dirt and Grass+Sand tiles exist (no direct Dirt+Sand transition).
 */
export function createThreeColorWangSet(): WangSet {
  const grass: WangColor = { id: 1, name: 'Grass', color: '#00ff00', imageTileId: 0, tilesetIndex: 0, probability: 1.0 };
  const dirt: WangColor = { id: 2, name: 'Dirt', color: '#8b4513', imageTileId: 15, tilesetIndex: 0, probability: 1.0 };
  const sand: WangColor = { id: 3, name: 'Sand', color: '#f4e242', imageTileId: 31, tilesetIndex: 0, probability: 1.0 };
  const ws = new WangSet('Ground', 'corner', [grass, dirt, sand]);
  addCornerTilePair(ws, 1, 2, 0);
  addCornerTilePair(ws, 1, 3, 16);
  finalizeWangSet(ws);
  return ws;
}

/** Initialize all tiles on a map by painting each cell with the given color. */
export function initMapTiles(map: SimpleAutotileMap, ws: WangSet, color: number): void {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      applyTerrainPaint(map, ws, x, y, color);
    }
  }
}
