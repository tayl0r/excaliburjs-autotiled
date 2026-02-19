import { NUM_MAP_LAYERS } from './layers.js';

export interface PlacedPrefab {
  prefabName: string;
  x: number;          // anchor cell x on map
  y: number;          // anchor cell y on map
  layer: number;      // base map layer (0-indexed)
}

export interface SavedMapV1 {
  version: 1;
  name: string;
  wangSetName: string;
  width: number;
  height: number;
  colors: number[];  // flat row-major, length = width * height
}

export interface SavedMap {
  version: 2;
  name: string;
  wangSetName: string;
  width: number;
  height: number;
  layers: number[][];  // 9 arrays, each flat row-major
  placedPrefabs?: PlacedPrefab[];
}

export function migrateMapV1toV2(v1: SavedMapV1): SavedMap {
  const size = v1.width * v1.height;
  const layers: number[][] = Array.from(
    { length: NUM_MAP_LAYERS },
    (_, i) => i === 0 ? v1.colors.slice() : new Array(size).fill(0),
  );
  return {
    version: 2,
    name: v1.name,
    wangSetName: v1.wangSetName,
    width: v1.width,
    height: v1.height,
    layers,
    placedPrefabs: [],
  };
}

export function parseSavedMap(raw: SavedMapV1 | SavedMap): SavedMap {
  if (!('version' in raw) || raw.version === 1) {
    return migrateMapV1toV2(raw as SavedMapV1);
  }
  const map = raw as SavedMap;
  // Pad layers to NUM_MAP_LAYERS if shorter
  const size = map.width * map.height;
  while (map.layers.length < NUM_MAP_LAYERS) {
    map.layers.push(new Array(size).fill(0));
  }
  if (!map.placedPrefabs) {
    map.placedPrefabs = [];
  }
  return map;
}
