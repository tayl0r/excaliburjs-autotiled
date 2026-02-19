import { NUM_PREFAB_LAYERS } from './layers.js';

export interface PrefabTile {
  x: number;
  y: number;
  tileId: number;
  tilesetIndex: number;
}

export interface SavedPrefabV1 {
  version: 1;
  name: string;
  tiles: PrefabTile[];
  anchorX: number;
  anchorY: number;
}

export interface SavedPrefab {
  version: 2;
  name: string;
  layers: PrefabTile[][];  // 5 layer arrays
  anchorX: number;
  anchorY: number;
}

export function migratePrefabV1toV2(v1: SavedPrefabV1): SavedPrefab {
  const layers: PrefabTile[][] = Array.from(
    { length: NUM_PREFAB_LAYERS },
    (_, i) => i === 0 ? v1.tiles.map(t => ({ ...t })) : [],
  );
  return {
    version: 2,
    name: v1.name,
    layers,
    anchorX: v1.anchorX,
    anchorY: v1.anchorY,
  };
}

export function parseSavedPrefab(raw: SavedPrefabV1 | SavedPrefab): SavedPrefab {
  // v1 has `tiles` array, v2 has `layers` array
  if ('tiles' in raw) {
    return migratePrefabV1toV2(raw as SavedPrefabV1);
  }
  const prefab = raw as SavedPrefab;
  // Pad layers if shorter than expected
  while (prefab.layers.length < NUM_PREFAB_LAYERS) {
    prefab.layers.push([]);
  }
  return prefab;
}
