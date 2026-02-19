import { describe, it, expect } from 'vitest';
import { NUM_MAP_LAYERS } from '../../src/core/layers.js';
import {
  migrateMapV1toV2,
  parseSavedMap,
  type SavedMapV1,
  type SavedMap,
} from '../../src/core/map-schema.js';
import {
  migratePrefabV1toV2,
  parseSavedPrefab,
  type SavedPrefabV1,
  type SavedPrefab,
} from '../../src/core/prefab-schema.js';

describe('migrateMapV1toV2', () => {
  it('migrates v1 colors to layer 0, fills layers 1-8 with zeros', () => {
    const v1: SavedMapV1 = {
      version: 1,
      name: 'test',
      wangSetName: 'Ground',
      width: 3,
      height: 2,
      colors: [1, 2, 1, 2, 1, 2],
    };

    const v2 = migrateMapV1toV2(v1);

    expect(v2.version).toBe(2);
    expect(v2.name).toBe('test');
    expect(v2.wangSetName).toBe('Ground');
    expect(v2.width).toBe(3);
    expect(v2.height).toBe(2);
    expect(v2.layers).toHaveLength(NUM_MAP_LAYERS);
    expect(v2.layers[0]).toEqual([1, 2, 1, 2, 1, 2]);
    for (let i = 1; i < NUM_MAP_LAYERS; i++) {
      expect(v2.layers[i]).toEqual([0, 0, 0, 0, 0, 0]);
    }
  });

  it('does not mutate the original v1 colors array', () => {
    const colors = [1, 2, 3, 4];
    const v1: SavedMapV1 = {
      version: 1, name: 'x', wangSetName: 'w', width: 2, height: 2, colors,
    };
    const v2 = migrateMapV1toV2(v1);
    v2.layers[0][0] = 99;
    expect(colors[0]).toBe(1);
  });
});

describe('parseSavedMap', () => {
  it('migrates v1 to v2', () => {
    const v1: SavedMapV1 = {
      version: 1, name: 'a', wangSetName: 'w', width: 2, height: 2,
      colors: [1, 1, 1, 1],
    };
    const result = parseSavedMap(v1);
    expect(result.version).toBe(2);
    expect(result.layers).toHaveLength(NUM_MAP_LAYERS);
    expect(result.layers[0]).toEqual([1, 1, 1, 1]);
  });

  it('passes through v2 unchanged', () => {
    const v2: SavedMap = {
      version: 2, name: 'b', wangSetName: 'w', width: 2, height: 2,
      layers: Array.from({ length: NUM_MAP_LAYERS }, () => [0, 0, 0, 0]),
    };
    v2.layers[0] = [1, 2, 3, 4];
    const result = parseSavedMap(v2);
    expect(result.version).toBe(2);
    expect(result.layers[0]).toEqual([1, 2, 3, 4]);
  });

  it('pads layers to NUM_MAP_LAYERS if shorter', () => {
    const short: SavedMap = {
      version: 2, name: 'c', wangSetName: 'w', width: 1, height: 1,
      layers: [[5], [0]],
    };
    const result = parseSavedMap(short);
    expect(result.layers).toHaveLength(NUM_MAP_LAYERS);
    expect(result.layers[0]).toEqual([5]);
    expect(result.layers[1]).toEqual([0]);
    for (let i = 2; i < NUM_MAP_LAYERS; i++) {
      expect(result.layers[i]).toEqual([0]);
    }
  });

  it('defaults placedPrefabs to [] when missing', () => {
    const v2: SavedMap = {
      version: 2, name: 'd', wangSetName: 'w', width: 1, height: 1,
      layers: Array.from({ length: NUM_MAP_LAYERS }, () => [0]),
    };
    const result = parseSavedMap(v2);
    expect(result.placedPrefabs).toEqual([]);
  });

  it('preserves existing placedPrefabs array', () => {
    const prefabs = [
      { prefabName: 'tree', x: 5, y: 3, layer: 0 },
      { prefabName: 'rock', x: 10, y: 7, layer: 1 },
    ];
    const v2: SavedMap = {
      version: 2, name: 'e', wangSetName: 'w', width: 1, height: 1,
      layers: Array.from({ length: NUM_MAP_LAYERS }, () => [0]),
      placedPrefabs: prefabs,
    };
    const result = parseSavedMap(v2);
    expect(result.placedPrefabs).toEqual(prefabs);
  });

  it('v1 migration defaults placedPrefabs to []', () => {
    const v1: SavedMapV1 = {
      version: 1, name: 'f', wangSetName: 'w', width: 1, height: 1,
      colors: [0],
    };
    const result = parseSavedMap(v1);
    expect(result.placedPrefabs).toEqual([]);
  });
});

describe('migratePrefabV1toV2', () => {
  it('migrates v1 tiles to layer 0, other layers empty', () => {
    const v1: SavedPrefabV1 = {
      version: 1,
      name: 'tree',
      tiles: [
        { x: 0, y: 0, tileId: 10, tilesetIndex: 0 },
        { x: 1, y: 0, tileId: 11, tilesetIndex: 0 },
      ],
      anchorX: 0,
      anchorY: 1,
    };

    const v2 = migratePrefabV1toV2(v1);

    expect(v2.version).toBe(2);
    expect(v2.name).toBe('tree');
    expect(v2.anchorX).toBe(0);
    expect(v2.anchorY).toBe(1);
    expect(v2.layers).toHaveLength(5);
    expect(v2.layers[0]).toHaveLength(2);
    expect(v2.layers[0][0]).toEqual({ x: 0, y: 0, tileId: 10, tilesetIndex: 0 });
    for (let i = 1; i < 5; i++) {
      expect(v2.layers[i]).toEqual([]);
    }
  });

  it('deep-clones tiles (no reference sharing)', () => {
    const tiles = [{ x: 0, y: 0, tileId: 5, tilesetIndex: 0 }];
    const v1: SavedPrefabV1 = {
      version: 1, name: 'x', tiles, anchorX: 0, anchorY: 0,
    };
    const v2 = migratePrefabV1toV2(v1);
    v2.layers[0][0].tileId = 99;
    expect(tiles[0].tileId).toBe(5);
  });
});

describe('parseSavedPrefab', () => {
  it('migrates v1 to v2', () => {
    const v1: SavedPrefabV1 = {
      version: 1, name: 'p', tiles: [{ x: 0, y: 0, tileId: 1, tilesetIndex: 0 }],
      anchorX: 0, anchorY: 0,
    };
    const result = parseSavedPrefab(v1);
    expect(result.version).toBe(2);
    expect(result.layers).toHaveLength(5);
    expect(result.layers[0]).toHaveLength(1);
  });

  it('passes through v2 unchanged', () => {
    const v2: SavedPrefab = {
      version: 2, name: 'q',
      layers: [[], [], [], [], []],
      anchorX: 0, anchorY: 0,
    };
    v2.layers[2] = [{ x: 1, y: 1, tileId: 7, tilesetIndex: 1 }];
    const result = parseSavedPrefab(v2);
    expect(result.version).toBe(2);
    expect(result.layers[2]).toHaveLength(1);
  });

  it('pads layers if shorter than 5', () => {
    const short: SavedPrefab = {
      version: 2, name: 'r',
      layers: [[], []],
      anchorX: 0, anchorY: 0,
    };
    const result = parseSavedPrefab(short);
    expect(result.layers).toHaveLength(5);
  });
});
