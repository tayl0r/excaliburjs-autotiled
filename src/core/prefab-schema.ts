import { NUM_PREFAB_LAYERS } from './layers.js';

export interface PrefabTile {
  x: number;
  y: number;
  tileId: number;
  tilesetIndex: number;
}

export interface SavedPrefab {
  version: 2;
  name: string;
  layers: PrefabTile[][];  // 5 layer arrays
  anchorX: number;
  anchorY: number;
}

/** Normalize a v2 SavedPrefab: pad layers if shorter than expected */
export function parseSavedPrefab(raw: SavedPrefab): SavedPrefab {
  while (raw.layers.length < NUM_PREFAB_LAYERS) {
    raw.layers.push([]);
  }
  return raw;
}
