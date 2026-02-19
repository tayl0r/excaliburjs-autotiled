export interface PrefabTile {
  x: number;
  y: number;
  tileId: number;
  tilesetIndex: number;
}

export interface SavedPrefab {
  version: 1;
  name: string;
  tiles: PrefabTile[];
  anchorX: number;
  anchorY: number;
}
