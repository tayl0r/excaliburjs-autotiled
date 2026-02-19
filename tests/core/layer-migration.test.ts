import { describe, it, expect } from 'vitest';
import { NUM_MAP_LAYERS } from '../../src/core/layers.js';
import {
  parseSavedMap,
  type SavedMap,
} from '../../src/core/map-schema.js';
import {
  parseSavedPrefab,
  type SavedPrefab,
} from '../../src/core/prefab-schema.js';

describe('parseSavedMap', () => {
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
});

describe('parseSavedPrefab', () => {
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
