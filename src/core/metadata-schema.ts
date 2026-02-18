/** TypeScript interfaces matching the JSON schema from AUTOTILE_JSON_SCHEMA.md */

/** A tileset definition within a project */
export interface TilesetDef {
  tilesetImage: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tileCount: number;
}

/** Multi-tileset project format (version 2) */
export interface ProjectMetadata {
  version: 2;
  tilesets: TilesetDef[];
  transformations?: TransformationConfig;
  wangsets: WangSetData[];
}

export interface TransformationConfig {
  allowRotate: boolean;
  allowFlipH: boolean;
  allowFlipV: boolean;
  preferUntransformed: boolean;
}

export interface WangSetData {
  name: string;
  type: 'corner' | 'edge' | 'mixed';
  tile: number;
  colors: WangColorData[];
  wangtiles: WangTileData[];
}

export interface WangColorData {
  name: string;
  color: string;
  probability: number;
  tile: number;
  tileset?: number;
}

export interface WangTileData {
  tileid: number;
  wangid: number[];
  probability?: number;  // Relative weight for tile selection (default 1.0)
  tileset?: number;      // Index into ProjectMetadata.tilesets[] (default 0)
  animation?: TileAnimation;
}

export interface TileAnimation {
  frameDuration: number;          // ms per frame
  pattern: 'loop' | 'ping-pong';
  frames: AnimationFrameData[];   // frame[0] = this tile, frame[1..n] = subsequent frames
}

export interface AnimationFrameData {
  tileId: number;      // -1 = unassigned
  tileset: number;
}

export const DEFAULT_TRANSFORMATIONS: TransformationConfig = {
  allowRotate: false,
  allowFlipH: false,
  allowFlipV: false,
  preferUntransformed: true,
};
