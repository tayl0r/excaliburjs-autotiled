import { WangId } from '../../src/core/wang-id.js';
import { WangSet } from '../../src/core/wang-set.js';
import type { WangColor } from '../../src/core/wang-color.js';
import { generateAllVariants } from '../../src/core/variant-generator.js';
import { computeColorDistances } from '../../src/core/color-distance.js';
import { DEFAULT_TRANSFORMATIONS } from '../../src/core/metadata-schema.js';

export function makeColor(id: number, name: string): WangColor {
  return { id, name, color: '#000000', imageTileId: -1, tilesetIndex: 0, probability: 1.0 };
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

/**
 * Create a fully initialized 3-color corner WangSet (Grass=1, Dirt=2, Sand=3).
 * Only Grass+Dirt and Grass+Sand tiles exist (no direct Dirt+Sand transition).
 */
export function createThreeColorWangSet(): WangSet {
  const grass: WangColor = { id: 1, name: 'Grass', color: '#00ff00', imageTileId: 0, tilesetIndex: 0, probability: 1.0 };
  const dirt: WangColor = { id: 2, name: 'Dirt', color: '#8b4513', imageTileId: 15, tilesetIndex: 0, probability: 1.0 };
  const sand: WangColor = { id: 3, name: 'Sand', color: '#f4e242', imageTileId: 31, tilesetIndex: 0, probability: 1.0 };
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
