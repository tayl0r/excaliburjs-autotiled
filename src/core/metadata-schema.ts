/** TypeScript interfaces matching the JSON schema from AUTOTILE_JSON_SCHEMA.md */

export interface TilesetMetadata {
  tilesetImage: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tileCount: number;
  transformations?: TransformationConfig;
  wangsets: WangSetData[];
  animations?: AnimationData[];
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
}

export interface WangTileData {
  tileid: number;
  wangid: number[];
}

export interface AnimationData {
  name: string;
  frameCount: number;
  frameDuration: number;
  pattern: 'loop' | 'ping-pong';
  frames: AnimationFrameData[];
}

export interface AnimationFrameData {
  tileIdOffset: number;
  description?: string;
}

export const DEFAULT_TRANSFORMATIONS: TransformationConfig = {
  allowRotate: false,
  allowFlipH: false,
  allowFlipV: false,
  preferUntransformed: true,
};
