import { describe, it, expect, beforeEach } from 'vitest';
import {
  TileRegistry,
  sanitizeSlug,
  computeAtlasLayout,
  resolvePrefab,
  stampPrefab,
  TILE_SIZE,
  MAX_ATLAS_PX,
} from '../../scripts/bake-lib.js';
import { createCell, EMPTY_CELL } from '@core/cell.js';
import type { SavedPrefab, PrefabTile } from '@core/prefab-schema.js';
import type { PlacedPrefab } from '@core/map-schema.js';
import type { TilesetDef } from '@core/metadata-schema.js';

// ============================================================
// sanitizeSlug
// ============================================================

describe('sanitizeSlug', () => {
  it('converts spaces to underscores', () => {
    expect(sanitizeSlug('house front')).toBe('house_front');
  });

  it('lowercases input', () => {
    expect(sanitizeSlug('MyMap')).toBe('mymap');
  });

  it('prefixes leading digits', () => {
    expect(sanitizeSlug('2fast')).toBe('_2fast');
  });

  it('escapes reserved words', () => {
    expect(sanitizeSlug('export')).toBe('_export');
    expect(sanitizeSlug('class')).toBe('_class');
    expect(sanitizeSlug('default')).toBe('_default');
  });

  it('strips non-alphanumeric characters', () => {
    expect(sanitizeSlug('grass+dirt')).toBe('grass_dirt');
  });

  it('strips leading/trailing underscores from cleanup', () => {
    expect(sanitizeSlug('__test__')).toBe('test');
  });

  it('handles empty string', () => {
    expect(sanitizeSlug('')).toBe('_unnamed');
  });
});

// ============================================================
// TileRegistry
// ============================================================

function makeTilesetDefs(...sizes: [number, number][]): TilesetDef[] {
  return sizes.map(([w, h]) => ({
    tilesetImage: 'test.png',
    tileWidth: w,
    tileHeight: h,
    columns: 10,
    tileCount: 100,
  }));
}

describe('TileRegistry', () => {
  let registry: TileRegistry;

  beforeEach(() => {
    registry = new TileRegistry();
  });

  it('returns 0 for empty cells', () => {
    expect(registry.register(EMPTY_CELL)).toBe(0);
    expect(registry.size).toBe(0);
  });

  it('assigns sequential IDs starting from 1', () => {
    const cell1 = createCell(100, false, false, false, 0);
    const cell2 = createCell(200, false, false, false, 0);
    expect(registry.register(cell1)).toBe(1);
    expect(registry.register(cell2)).toBe(2);
    expect(registry.size).toBe(2);
  });

  it('deduplicates same cell', () => {
    const cell = createCell(100, false, false, false, 0);
    const id1 = registry.register(cell);
    const id2 = registry.register(cell);
    expect(id1).toBe(id2);
    expect(registry.size).toBe(1);
  });

  it('treats different tilesetIndex as different tiles', () => {
    const cell1 = createCell(100, false, false, false, 0);
    const cell2 = createCell(100, false, false, false, 1);
    expect(registry.register(cell1)).not.toBe(registry.register(cell2));
    expect(registry.size).toBe(2);
  });

  it('treats different flip flags as different tiles', () => {
    const base = createCell(100, false, false, false, 0);
    const flipped = createCell(100, true, false, false, 0);
    expect(registry.register(base)).not.toBe(registry.register(flipped));
    expect(registry.size).toBe(2);
  });

  it('handles tileId 0 as a valid tile (not empty)', () => {
    const cell = createCell(0, false, false, false, 0);
    const id = registry.register(cell);
    expect(id).toBe(1); // not 0 (empty)
    expect(registry.size).toBe(1);
  });

  it('returns all entries', () => {
    registry.register(createCell(10, false, false, false, 0));
    registry.register(createCell(20, false, false, false, 0));
    const entries = registry.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0].bakedId).toBe(1);
    expect(entries[1].bakedId).toBe(2);
  });

  it('tracks source dimensions from tileset metadata', () => {
    const defs = makeTilesetDefs([16, 16], [60, 64]);
    const registry = new TileRegistry(defs);
    registry.register(createCell(0, false, false, false, 0));
    registry.register(createCell(0, false, false, false, 1));
    const entries = registry.entries();
    expect(entries[0].sourceWidth).toBe(16);
    expect(entries[0].sourceHeight).toBe(16);
    expect(entries[1].sourceWidth).toBe(60);
    expect(entries[1].sourceHeight).toBe(64);
  });

  it('defaults to TILE_SIZE when no tileset defs provided', () => {
    const registry = new TileRegistry();
    registry.register(createCell(0, false, false, false, 0));
    const entries = registry.entries();
    expect(entries[0].sourceWidth).toBe(TILE_SIZE);
    expect(entries[0].sourceHeight).toBe(TILE_SIZE);
  });

  it('reports oversized tiles', () => {
    const defs = makeTilesetDefs([16, 16], [60, 64]);
    const registry = new TileRegistry(defs);
    registry.register(createCell(0, false, false, false, 0));
    registry.register(createCell(0, false, false, false, 1));
    const entries = registry.entries();
    expect(registry.isOversized(entries[0])).toBe(false);
    expect(registry.isOversized(entries[1])).toBe(true);
  });

  it('separates normal and oversized entries', () => {
    const defs = makeTilesetDefs([16, 16], [60, 64]);
    const registry = new TileRegistry(defs);
    registry.register(createCell(0, false, false, false, 0));
    registry.register(createCell(5, false, false, false, 0));
    registry.register(createCell(0, false, false, false, 1));
    expect(registry.normalEntries()).toHaveLength(2);
    expect(registry.oversizedEntries()).toHaveLength(1);
  });
});

// ============================================================
// computeAtlasLayout
// ============================================================

describe('computeAtlasLayout', () => {
  it('returns 0 files for 0 tiles', () => {
    const layout = computeAtlasLayout(0);
    expect(layout.fileCount).toBe(0);
  });

  it('fits 1 tile in a 16x16 atlas (1 col)', () => {
    const layout = computeAtlasLayout(1);
    expect(layout.pixelSize).toBe(TILE_SIZE);
    expect(layout.columns).toBe(1);
    expect(layout.fileCount).toBe(1);
  });

  it('fits 4 tiles in 32x32 atlas (2 cols)', () => {
    const layout = computeAtlasLayout(4);
    expect(layout.pixelSize).toBe(32);
    expect(layout.columns).toBe(2);
    expect(layout.fileCount).toBe(1);
  });

  it('bumps to next power-of-2 for 5 tiles', () => {
    const layout = computeAtlasLayout(5);
    // 3*3=9 >= 5, but 3 is not pow2, so cols=4 -> 64x64
    expect(layout.columns).toBe(4);
    expect(layout.pixelSize).toBe(64);
    expect(layout.fileCount).toBe(1);
  });

  it('fits exactly at power-of-2 boundary (16 tiles)', () => {
    const layout = computeAtlasLayout(16);
    expect(layout.columns).toBe(4);
    expect(layout.pixelSize).toBe(64);
    expect(layout.fileCount).toBe(1);
  });

  it('max single file is 2048x2048 = 16384 tiles', () => {
    const maxTiles = (MAX_ATLAS_PX / TILE_SIZE) ** 2; // 16384
    const layout = computeAtlasLayout(maxTiles);
    expect(layout.pixelSize).toBe(MAX_ATLAS_PX);
    expect(layout.columns).toBe(MAX_ATLAS_PX / TILE_SIZE);
    expect(layout.fileCount).toBe(1);
  });

  it('splits into 2 files for 16385 tiles', () => {
    const layout = computeAtlasLayout(16385);
    expect(layout.fileCount).toBe(2);
    expect(layout.pixelSize).toBe(MAX_ATLAS_PX);
  });
});

// ============================================================
// resolvePrefab
// ============================================================

describe('resolvePrefab', () => {
  it('computes bounding box and rebases anchor', () => {
    const prefab: SavedPrefab = {
      version: 2,
      name: 'test prefab',
      anchorX: 5,
      anchorY: 8,
      layers: [
        [
          { x: 3, y: 6, tileId: 100, tilesetIndex: 0 },
          { x: 5, y: 8, tileId: 101, tilesetIndex: 0 },
        ],
        [], [], [], [],
      ],
    };
    const registry = new TileRegistry();
    const result = resolvePrefab(prefab, registry);

    expect(result.width).toBe(3);   // 5-3+1
    expect(result.height).toBe(3);  // 8-6+1
    expect(result.anchorX).toBe(2); // 5-3
    expect(result.anchorY).toBe(2); // 8-6
  });

  it('handles empty prefab', () => {
    const prefab: SavedPrefab = {
      version: 2,
      name: 'empty',
      anchorX: 0,
      anchorY: 0,
      layers: [[], [], [], [], []],
    };
    const registry = new TileRegistry();
    const result = resolvePrefab(prefab, registry);

    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
    expect(result.layers.every(l => l.length === 0)).toBe(true);
  });

  it('converts sparse tiles to dense grid', () => {
    const prefab: SavedPrefab = {
      version: 2,
      name: 'sparse',
      anchorX: 0,
      anchorY: 0,
      layers: [
        [
          { x: 0, y: 0, tileId: 10, tilesetIndex: 0 },
          { x: 2, y: 1, tileId: 20, tilesetIndex: 0 },
        ],
        [], [], [], [],
      ],
    };
    const registry = new TileRegistry();
    const result = resolvePrefab(prefab, registry);

    expect(result.width).toBe(3);  // 0-2
    expect(result.height).toBe(2); // 0-1

    // layer[0]: 3x2 grid, (0,0) has tile, (2,1) has tile, rest empty
    expect(result.layers[0][0 * 3 + 0]).toBeGreaterThan(0); // (0,0)
    expect(result.layers[0][0 * 3 + 1]).toBe(0);            // (1,0) empty
    expect(result.layers[0][1 * 3 + 2]).toBeGreaterThan(0); // (2,1)
  });
});

// ============================================================
// stampPrefab
// ============================================================

describe('stampPrefab', () => {
  it('places tiles at correct anchor-offset positions', () => {
    const mapWidth = 10;
    const mapHeight = 10;
    const layers = [new Uint16Array(mapWidth * mapHeight)];

    const prefab: SavedPrefab = {
      version: 2,
      name: 'stamp test',
      anchorX: 1,
      anchorY: 1,
      layers: [
        [{ x: 0, y: 0, tileId: 42, tilesetIndex: 0 }],
        [], [], [], [],
      ],
    };

    const placement: PlacedPrefab = {
      prefabName: 'stamp test',
      x: 5, y: 5,
      layer: 0,
    };

    const registry = new TileRegistry();
    stampPrefab(layers, mapWidth, mapHeight, prefab, placement, registry);

    // tile at prefab (0,0), anchor (1,1), placed at (5,5)
    // map pos = (5 + (0-1), 5 + (0-1)) = (4, 4)
    expect(layers[0][4 * mapWidth + 4]).toBeGreaterThan(0);
  });

  it('clips out-of-bounds tiles', () => {
    const mapWidth = 5;
    const mapHeight = 5;
    const layers = [new Uint16Array(mapWidth * mapHeight)];

    const prefab: SavedPrefab = {
      version: 2,
      name: 'oob test',
      anchorX: 0,
      anchorY: 0,
      layers: [
        [
          { x: 0, y: 0, tileId: 1, tilesetIndex: 0 },
          { x: 10, y: 10, tileId: 2, tilesetIndex: 0 }, // out of bounds
        ],
        [], [], [], [],
      ],
    };

    const placement: PlacedPrefab = { prefabName: 'oob test', x: 0, y: 0, layer: 0 };
    const registry = new TileRegistry();
    stampPrefab(layers, mapWidth, mapHeight, prefab, placement, registry);

    // Only (0,0) should be placed
    expect(layers[0][0]).toBeGreaterThan(0);
    // Registry should have 1 tile (the OOB one was registered but not placed—wait, it's clipped before register)
    // Actually stampPrefab registers then checks bounds... let me re-check the code
    // No, it checks bounds first then registers. So only 1 tile registered.
    expect(registry.size).toBe(1);
  });
});
