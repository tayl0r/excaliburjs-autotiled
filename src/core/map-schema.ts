import { NUM_MAP_LAYERS } from './layers.js';

export interface PlacedPrefab {
  prefabName: string;
  x: number;          // anchor cell x on map
  y: number;          // anchor cell y on map
  layer: number;      // base map layer (0-indexed)
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

/** Normalize a v2 SavedMap: pad layers, default placedPrefabs */
export function parseSavedMap(raw: SavedMap): SavedMap {
  const size = raw.width * raw.height;
  while (raw.layers.length < NUM_MAP_LAYERS) {
    raw.layers.push(new Array(size).fill(0));
  }
  raw.placedPrefabs ??= [];
  return raw;
}
