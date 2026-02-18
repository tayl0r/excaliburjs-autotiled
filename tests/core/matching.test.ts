import { describe, it, expect } from 'vitest';
import { WangId } from '../../src/core/wang-id.js';
import { WangSet } from '../../src/core/wang-set.js';
import { WangColor } from '../../src/core/wang-color.js';
import { SimpleAutotileMap } from '../../src/core/autotile-map.js';
import { wangIdFromSurroundings, findBestMatch } from '../../src/core/matching.js';
import { computeColorDistances } from '../../src/core/color-distance.js';
import { generateAllVariants } from '../../src/core/variant-generator.js';
import { applyTerrainPaint } from '../../src/core/terrain-painter.js';
import { DEFAULT_TRANSFORMATIONS } from '../../src/core/metadata-schema.js';
import { createCell } from '../../src/core/cell.js';

// Helper: create a 2-color corner WangSet with 16 tiles
function createGrassDirtWangSet(): WangSet {
  const grass: WangColor = { id: 1, name: 'Grass', color: '#00ff00', imageTileId: 0, probability: 1.0 };
  const dirt: WangColor = { id: 2, name: 'Dirt', color: '#8b4513', imageTileId: 15, probability: 1.0 };
  const ws = new WangSet('Ground', 'corner', [grass, dirt]);

  // 16 tiles using standard binary layout
  // N = TL(bit3) TR(bit2) BR(bit1) BL(bit0), where 0=Grass(1), 1=Dirt(2)
  for (let n = 0; n < 16; n++) {
    const tl = (n & 8) ? 2 : 1;
    const tr = (n & 4) ? 2 : 1;
    const br = (n & 2) ? 2 : 1;
    const bl = (n & 1) ? 2 : 1;
    // WangId: [Top, TopRight, Right, BottomRight, Bottom, BottomLeft, Left, TopLeft]
    // Corner type: edges=0, corners: TL=idx7, TR=idx1, BR=idx3, BL=idx5
    ws.addTileMapping(0, n, WangId.fromArray([0, tr, 0, br, 0, bl, 0, tl]));
  }

  // Generate variants (no transforms)
  const variants = generateAllVariants(ws, DEFAULT_TRANSFORMATIONS);
  ws.setVariants(variants);

  // Compute distances
  const { distances, nextHop } = computeColorDistances(ws);
  ws.setDistanceMatrix(distances);
  ws.setNextHopMatrix(nextHop);

  return ws;
}

describe('computeColorDistances', () => {
  it('self-distance is 0', () => {
    const ws = createGrassDirtWangSet();
    expect(ws.colorDistance(1, 1)).toBe(0);
    expect(ws.colorDistance(2, 2)).toBe(0);
  });

  it('direct transition distance is 1', () => {
    const ws = createGrassDirtWangSet();
    expect(ws.colorDistance(1, 2)).toBe(1);
    expect(ws.colorDistance(2, 1)).toBe(1);
  });
});

describe('generateAllVariants', () => {
  it('generates 16 variants with no transforms', () => {
    const ws = createGrassDirtWangSet();
    expect(ws.allVariants()).toHaveLength(16);
  });

  it('each variant has correct WangId', () => {
    const ws = createGrassDirtWangSet();
    for (const v of ws.allVariants()) {
      // Verify tile ID matches the WangId
      const n = v.cell.tileId;
      const tl = (n & 8) ? 2 : 1;
      const tr = (n & 4) ? 2 : 1;
      const br = (n & 2) ? 2 : 1;
      const bl = (n & 1) ? 2 : 1;
      expect(v.wangId.indexColor(7)).toBe(tl); // TopLeft
      expect(v.wangId.indexColor(1)).toBe(tr); // TopRight
      expect(v.wangId.indexColor(3)).toBe(br); // BottomRight
      expect(v.wangId.indexColor(5)).toBe(bl); // BottomLeft
    }
  });
});

describe('wangIdFromSurroundings', () => {
  it('returns all wildcards for empty map', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(5, 5);
    const desired = wangIdFromSurroundings(map, 2, 2, ws);
    // All zeros since no tiles placed and no colors painted
    for (let i = 0; i < 8; i++) {
      expect(desired.indexColor(i)).toBe(0);
    }
  });

  it('reads painted colors from neighbors', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(5, 5, 1); // All grass

    // Paint dirt at (3, 2) - right neighbor of (2, 2)
    map.setColorAt(3, 2, 2);

    const desired = wangIdFromSurroundings(map, 2, 2, ws);
    // Right neighbor (index 2) painted as dirt -> our Right edge should be 2
    expect(desired.indexColor(2)).toBe(2);
  });

  it('reads WangIds from placed tile neighbors', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(5, 5, 1);

    // Place tile 15 (all dirt) at diagonal neighbors
    // TopLeft neighbor (1,1) → our index 7, reads their opposite index 3 (BottomRight)
    map.setCellAt(1, 1, createCell(15));
    map.setColorAt(1, 1, 2);
    // TopRight neighbor (3,1) → our index 1, reads their opposite index 5 (BottomLeft)
    map.setCellAt(3, 1, createCell(15));
    map.setColorAt(3, 1, 2);

    const desired = wangIdFromSurroundings(map, 2, 2, ws);
    // Tile 15 = [0,2,0,2,0,2,0,2]. Index 3 = 2 (dirt), Index 5 = 2 (dirt)
    expect(desired.indexColor(7)).toBe(2); // TopLeft: from (1,1)'s BottomRight
    expect(desired.indexColor(1)).toBe(2); // TopRight: from (3,1)'s BottomLeft
  });
});

describe('findBestMatch', () => {
  it('finds exact match for all-grass desired', () => {
    const ws = createGrassDirtWangSet();
    const desired = WangId.fromArray([0, 1, 0, 1, 0, 1, 0, 1]);
    const cell = findBestMatch(ws, desired, 'corner');
    expect(cell).toBeDefined();
    expect(cell!.tileId).toBe(0); // Tile 0 = all grass
  });

  it('finds exact match for all-dirt desired', () => {
    const ws = createGrassDirtWangSet();
    const desired = WangId.fromArray([0, 2, 0, 2, 0, 2, 0, 2]);
    const cell = findBestMatch(ws, desired, 'corner');
    expect(cell).toBeDefined();
    expect(cell!.tileId).toBe(15); // Tile 15 = all dirt
  });

  it('finds correct transition tile', () => {
    const ws = createGrassDirtWangSet();
    // Desired: TL=Dirt, TR=Grass, BR=Grass, BL=Grass
    // This is tile 8: TL=1(bit3), TR=0, BR=0, BL=0 → TL=Dirt
    const desired = WangId.fromArray([0, 1, 0, 1, 0, 1, 0, 2]);
    const cell = findBestMatch(ws, desired, 'corner');
    expect(cell).toBeDefined();
    expect(cell!.tileId).toBe(8);
  });

  it('returns undefined when no match possible', () => {
    // Create WangSet with only all-grass tile
    const grass: WangColor = { id: 1, name: 'Grass', color: '#00ff00', imageTileId: 0, probability: 1.0 };
    const dirt: WangColor = { id: 2, name: 'Dirt', color: '#8b4513', imageTileId: 1, probability: 1.0 };
    const ws = new WangSet('Ground', 'corner', [grass, dirt]);
    ws.addTileMapping(0, 0, WangId.fromArray([0, 1, 0, 1, 0, 1, 0, 1]));
    ws.setVariants(generateAllVariants(ws, DEFAULT_TRANSFORMATIONS));
    const { distances: dist, nextHop: hop } = computeColorDistances(ws);
    ws.setDistanceMatrix(dist);
    ws.setNextHopMatrix(hop);

    // Desired all-dirt, but only grass tile available
    const desired = WangId.fromArray([0, 2, 0, 2, 0, 2, 0, 2]);
    const cell = findBestMatch(ws, desired, 'corner');
    // Should fail since grass (1) can't transition to dirt (2) - no tile has both colors
    // Actually, with only grass tiles, distance(1,2) = -1, so no match
    expect(cell).toBeUndefined();
  });
});

describe('applyTerrainPaint', () => {
  it('paints center and updates all 9 cells', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(5, 5, 1); // All grass

    const affected = applyTerrainPaint(map, ws, 2, 2, 2); // Paint dirt at center
    expect(affected.length).toBe(9); // Center + 8 neighbors

    // Center should be dirt
    expect(map.colorAt(2, 2)).toBe(2);
  });

  it('uses vertex mapping for corner tiles', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(5, 5, 1); // All grass

    // Initialize all tiles so they have valid tile IDs
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        applyTerrainPaint(map, ws, x, y, 1);
      }
    }

    // Paint dirt at (2,2)
    applyTerrainPaint(map, ws, 2, 2, 2);

    // With vertex mapping: tile corners come from painted colors
    //   Corner 7 (TL) = paintedColor(x, y)     [self]
    //   Corner 1 (TR) = paintedColor(x+1, y)   [right]
    //   Corner 3 (BR) = paintedColor(x+1, y+1) [bottom-right]
    //   Corner 5 (BL) = paintedColor(x, y+1)   [bottom]
    //
    // Tile (2,2): TL=Dirt(2), TR=Grass(1), BR=Grass(1), BL=Grass(1)
    //   = tile 8 (only TL=Dirt, bit3=1)
    expect(map.tileIdAt(2, 2)).toBe(8);

    // Tile (1,2): TL=Grass, TR=Dirt(from cell 2,2), BR=Grass, BL=Grass
    //   = tile 4 (only TR=Dirt, bit2=1)
    expect(map.tileIdAt(1, 2)).toBe(4);

    // Tile (1,1): TL=Grass, TR=Grass, BR=Dirt(from cell 2,2), BL=Grass
    //   = tile 2 (only BR=Dirt, bit1=1)
    expect(map.tileIdAt(1, 1)).toBe(2);

    // Tile (2,1): TL=Grass, TR=Grass, BR=Grass, BL=Dirt(from cell 2,2)
    //   = tile 1 (only BL=Dirt, bit0=1)
    expect(map.tileIdAt(2, 1)).toBe(1);

    // Other neighbors remain all-grass (tile 0)
    expect(map.tileIdAt(3, 2)).toBe(0);
    expect(map.tileIdAt(3, 3)).toBe(0);
    expect(map.tileIdAt(2, 3)).toBe(0);
  });

  it('2x2 dirt block produces all-dirt center', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(5, 5, 1);

    // Initialize
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        applyTerrainPaint(map, ws, x, y, 1);
      }
    }

    // Paint a 2x2 block of dirt at (2,2), (3,2), (2,3), (3,3)
    applyTerrainPaint(map, ws, 2, 2, 2);
    applyTerrainPaint(map, ws, 3, 2, 2);
    applyTerrainPaint(map, ws, 2, 3, 2);
    applyTerrainPaint(map, ws, 3, 3, 2);

    // Tile (2,2) corners: TL=Dirt(2,2), TR=Dirt(3,2), BR=Dirt(3,3), BL=Dirt(2,3)
    // All dirt → tile 15
    expect(map.tileIdAt(2, 2)).toBe(15);
  });

  it('handles edge of map gracefully', () => {
    const ws = createGrassDirtWangSet();
    const map = new SimpleAutotileMap(5, 5, 1);

    // Paint at corner - should not crash
    const affected = applyTerrainPaint(map, ws, 0, 0, 2);
    // Corner has only 3 valid neighbors + itself = 4
    expect(affected.length).toBe(4);
  });
});

// Helper: create a 3-color corner WangSet (Grass=1, Dirt=2, Sand=3)
// where only Grass+Dirt and Grass+Sand tiles exist (no direct Dirt+Sand)
function createThreeColorWangSet(): WangSet {
  const grass: WangColor = { id: 1, name: 'Grass', color: '#00ff00', imageTileId: 0, probability: 1.0 };
  const dirt: WangColor = { id: 2, name: 'Dirt', color: '#8b4513', imageTileId: 15, probability: 1.0 };
  const sand: WangColor = { id: 3, name: 'Sand', color: '#f4e242', imageTileId: 31, probability: 1.0 };
  const ws = new WangSet('Ground', 'corner', [grass, dirt, sand]);

  // 16 Grass+Dirt tiles (tileIds 0-15)
  for (let n = 0; n < 16; n++) {
    const tl = (n & 8) ? 2 : 1;
    const tr = (n & 4) ? 2 : 1;
    const br = (n & 2) ? 2 : 1;
    const bl = (n & 1) ? 2 : 1;
    ws.addTileMapping(0, n, WangId.fromArray([0, tr, 0, br, 0, bl, 0, tl]));
  }

  // 16 Grass+Sand tiles (tileIds 16-31)
  for (let n = 0; n < 16; n++) {
    const tl = (n & 8) ? 3 : 1;
    const tr = (n & 4) ? 3 : 1;
    const br = (n & 2) ? 3 : 1;
    const bl = (n & 1) ? 3 : 1;
    ws.addTileMapping(0, 16 + n, WangId.fromArray([0, tr, 0, br, 0, bl, 0, tl]));
  }

  const variants = generateAllVariants(ws, DEFAULT_TRANSFORMATIONS);
  ws.setVariants(variants);

  const { distances, nextHop } = computeColorDistances(ws);
  ws.setDistanceMatrix(distances);
  ws.setNextHopMatrix(nextHop);

  return ws;
}

describe('findBestMatch with penalty scoring', () => {
  it('finds approximate match across color boundaries', () => {
    const ws = createThreeColorWangSet();
    // Desired: TL=Dirt(2), TR=Sand(3), BR=Sand(3), BL=Dirt(2)
    // No tile has both Dirt and Sand, but with penalty scoring
    // a Grass+Dirt or Grass+Sand tile should be chosen as best approximate
    const desired = WangId.fromArray([0, 3, 0, 3, 0, 2, 0, 2]);
    const cell = findBestMatch(ws, desired, 'corner');
    expect(cell).toBeDefined();
  });
});

describe('Cell flip flags preserved through map storage', () => {
  it('stores and retrieves flip flags from setCellAt/cellAt', () => {
    const map = new SimpleAutotileMap(3, 3);
    map.setCellAt(1, 1, createCell(5, true, false, true));
    const cell = map.cellAt(1, 1);
    expect(cell.tileId).toBe(5);
    expect(cell.flipH).toBe(true);
    expect(cell.flipV).toBe(false);
    expect(cell.flipD).toBe(true);
  });

  it('preserves flip flags when terrain paint resolves a flipped variant', () => {
    // Create a WangSet with limited tiles + allowFlipH so flipping is required
    const grass: WangColor = { id: 1, name: 'Grass', color: '#00ff00', imageTileId: 0, probability: 1.0 };
    const dirt: WangColor = { id: 2, name: 'Dirt', color: '#8b4513', imageTileId: 15, probability: 1.0 };
    const ws = new WangSet('Ground', 'corner', [grass, dirt]);

    // Only provide tiles where TL differs from TR but BR=BL
    // Tile 4: TL=Grass, TR=Dirt, BR=Grass, BL=Grass  (only TR is dirt)
    ws.addTileMapping(0, 4, WangId.fromArray([0, 2, 0, 1, 0, 1, 0, 1]));
    // Tile 0: all grass
    ws.addTileMapping(0, 0, WangId.fromArray([0, 1, 0, 1, 0, 1, 0, 1]));
    // Tile 15: all dirt
    ws.addTileMapping(0, 15, WangId.fromArray([0, 2, 0, 2, 0, 2, 0, 2]));

    // No tile 8 (TL=Dirt, TR=Grass) — it must come from flipH of tile 4
    const transforms = { allowRotate: false, allowFlipH: true, allowFlipV: false, preferUntransformed: true };
    const variants = generateAllVariants(ws, transforms);
    ws.setVariants(variants);

    const { distances, nextHop } = computeColorDistances(ws);
    ws.setDistanceMatrix(distances);
    ws.setNextHopMatrix(nextHop);

    // Desired: TL=Dirt, TR=Grass, BR=Grass, BL=Grass (like tile 8 which we don't have)
    const desired = WangId.fromArray([0, 1, 0, 1, 0, 1, 0, 2]);
    const cell = findBestMatch(ws, desired, 'corner');
    expect(cell).toBeDefined();
    expect(cell!.tileId).toBe(4); // Base tile 4, flipped
    expect(cell!.flipH).toBe(true); // Must be horizontally flipped

    // Now verify the full round-trip through terrain paint
    const map = new SimpleAutotileMap(5, 5, 1);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        applyTerrainPaint(map, ws, x, y, 1);
      }
    }

    // Paint dirt at (2,2)
    applyTerrainPaint(map, ws, 2, 2, 2);

    // Tile at (1,2): TL=Grass, TR=Dirt(2,2), BR=Grass, BL=Grass → tile 4, no flip
    const cellLeft = map.cellAt(1, 2);
    expect(cellLeft.tileId).toBe(4);
    expect(cellLeft.flipH).toBe(false);

    // Tile at (2,2): TL=Dirt(2,2), TR=Grass(3,2), BR=Grass(3,3), BL=Grass(2,3)
    // This is [0,1,0,1,0,1,0,2] = TL=Dirt only, which is flipH of tile 4
    const cellCenter = map.cellAt(2, 2);
    expect(cellCenter.tileId).toBe(4); // flipped tile 4
    expect(cellCenter.flipH).toBe(true);
  });
});

describe('applyTerrainPaint with intermediates', () => {
  it('auto-inserts grass between dirt and sand', () => {
    const ws = createThreeColorWangSet();
    // 7-wide map: all sand initially
    const map = new SimpleAutotileMap(7, 1, 3);

    // Initialize tiles
    for (let x = 0; x < 7; x++) {
      applyTerrainPaint(map, ws, x, 0, 3);
    }

    // Paint dirt at center (x=3) — next to sand on both sides
    // Dirt→Sand distance is 2 (via Grass), so Grass should be auto-inserted
    applyTerrainPaint(map, ws, 3, 0, 2);

    // Center should be dirt
    expect(map.colorAt(3, 0)).toBe(2);

    // Immediate neighbors should be changed to Grass (the intermediate)
    expect(map.colorAt(2, 0)).toBe(1); // left: Sand→Grass (nextHop from Dirt to Sand = Grass)
    expect(map.colorAt(4, 0)).toBe(1); // right: Sand→Grass

    // Cells beyond the intermediate should still be Sand
    expect(map.colorAt(1, 0)).toBe(3);
    expect(map.colorAt(5, 0)).toBe(3);
  });

  it('auto-inserts grass at all 8 neighbors (including diagonals) on a 2D map', () => {
    const ws = createThreeColorWangSet();
    // 5x5 map, all dirt
    const map = new SimpleAutotileMap(5, 5, 2);

    // Initialize tiles
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        applyTerrainPaint(map, ws, x, y, 2);
      }
    }

    // Paint sand at center (2,2) — Dirt→Sand distance is 2 (via Grass)
    applyTerrainPaint(map, ws, 2, 2, 3);

    // Center should be sand
    expect(map.colorAt(2, 2)).toBe(3);

    // All 8 neighbors (including diagonals) should be changed to Grass
    const neighbors = [
      [2, 1], [3, 1], [3, 2], [3, 3],
      [2, 3], [1, 3], [1, 2], [1, 1],
    ];
    for (const [nx, ny] of neighbors) {
      expect(map.colorAt(nx, ny)).toBe(1); // Grass intermediate
    }

    // Cells beyond the ring should still be dirt
    expect(map.colorAt(0, 0)).toBe(2);
    expect(map.colorAt(4, 0)).toBe(2);
    expect(map.colorAt(0, 4)).toBe(2);
    expect(map.colorAt(4, 4)).toBe(2);
  });

  it('all resolved tiles use at most 2 colors after 2D intermediate insertion', () => {
    const ws = createThreeColorWangSet();
    const map = new SimpleAutotileMap(5, 5, 2);

    // Initialize tiles
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        applyTerrainPaint(map, ws, x, y, 2);
      }
    }

    // Paint sand at center
    applyTerrainPaint(map, ws, 2, 2, 3);

    // Every tile with a valid ID should have a WangId with at most 2 distinct colors
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const tileId = map.tileIdAt(x, y);
        if (tileId < 0) continue;
        const wangId = ws.wangIdOf(0, tileId);
        if (!wangId) continue;
        const colors = new Set<number>();
        for (let i = 0; i < 8; i++) {
          const c = wangId.indexColor(i);
          if (c !== 0) colors.add(c);
        }
        expect(colors.size).toBeLessThanOrEqual(2);
      }
    }
  });

  it('does not insert intermediates for direct transitions', () => {
    const ws = createThreeColorWangSet();
    const map = new SimpleAutotileMap(5, 1, 1); // All grass

    // Initialize tiles
    for (let x = 0; x < 5; x++) {
      applyTerrainPaint(map, ws, x, 0, 1);
    }

    // Paint dirt at center — Grass→Dirt distance is 1, no intermediate needed
    applyTerrainPaint(map, ws, 2, 0, 2);

    expect(map.colorAt(2, 0)).toBe(2); // Center = dirt
    expect(map.colorAt(1, 0)).toBe(1); // Neighbors unchanged (still grass)
    expect(map.colorAt(3, 0)).toBe(1);
  });

  it('cascades intermediates for multi-hop distances', () => {
    // With A↔B, B↔C, C↔D: painting A next to D should insert B then C
    const a: WangColor = { id: 1, name: 'A', color: '#ff0000', imageTileId: 0, probability: 1.0 };
    const b: WangColor = { id: 2, name: 'B', color: '#00ff00', imageTileId: 0, probability: 1.0 };
    const c: WangColor = { id: 3, name: 'C', color: '#0000ff', imageTileId: 0, probability: 1.0 };
    const d: WangColor = { id: 4, name: 'D', color: '#ffff00', imageTileId: 0, probability: 1.0 };
    const ws = new WangSet('Test', 'corner', [a, b, c, d]);

    let tileId = 0;
    // A-B tiles
    for (let n = 0; n < 16; n++) {
      const tl = (n & 8) ? 2 : 1;
      const tr = (n & 4) ? 2 : 1;
      const br = (n & 2) ? 2 : 1;
      const bl = (n & 1) ? 2 : 1;
      ws.addTileMapping(0, tileId++, WangId.fromArray([0, tr, 0, br, 0, bl, 0, tl]));
    }
    // B-C tiles
    for (let n = 0; n < 16; n++) {
      const tl = (n & 8) ? 3 : 2;
      const tr = (n & 4) ? 3 : 2;
      const br = (n & 2) ? 3 : 2;
      const bl = (n & 1) ? 3 : 2;
      ws.addTileMapping(0, tileId++, WangId.fromArray([0, tr, 0, br, 0, bl, 0, tl]));
    }
    // C-D tiles
    for (let n = 0; n < 16; n++) {
      const tl = (n & 8) ? 4 : 3;
      const tr = (n & 4) ? 4 : 3;
      const br = (n & 2) ? 4 : 3;
      const bl = (n & 1) ? 4 : 3;
      ws.addTileMapping(0, tileId++, WangId.fromArray([0, tr, 0, br, 0, bl, 0, tl]));
    }

    ws.setVariants(generateAllVariants(ws, DEFAULT_TRANSFORMATIONS));
    const { distances, nextHop } = computeColorDistances(ws);
    ws.setDistanceMatrix(distances);
    ws.setNextHopMatrix(nextHop);

    // Distance A→D should be 3
    expect(ws.colorDistance(1, 4)).toBe(3);

    // Create a 7-cell wide map, all D
    const map = new SimpleAutotileMap(7, 1, 4);
    for (let x = 0; x < 7; x++) {
      applyTerrainPaint(map, ws, x, 0, 4);
    }

    // Paint A at center (x=3)
    applyTerrainPaint(map, ws, 3, 0, 1);

    // Center = A
    expect(map.colorAt(3, 0)).toBe(1);
    // Neighbors should cascade: A's neighbor gets nextHop(A, D) = B
    expect(map.colorAt(2, 0)).toBe(2); // B
    expect(map.colorAt(4, 0)).toBe(2); // B
    // Next layer: B's neighbor (was D) gets nextHop(B, D) = C
    expect(map.colorAt(1, 0)).toBe(3); // C
    expect(map.colorAt(5, 0)).toBe(3); // C
    // Outermost cells stay D (C→D is distance 1, no intermediate needed)
    expect(map.colorAt(0, 0)).toBe(4); // D
    expect(map.colorAt(6, 0)).toBe(4); // D
  });
});
