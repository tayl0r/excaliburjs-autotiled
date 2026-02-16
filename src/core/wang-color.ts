export interface WangColor {
  /** 1-based index (0 = wildcard, not stored as a color) */
  id: number;
  name: string;
  /** Hex color for editor overlay display, e.g. "#00ff00" */
  color: string;
  /** Representative tile ID for UI thumbnails (-1 = none) */
  imageTileId: number;
  /** Weight for random selection (default 1.0) */
  probability: number;
}
