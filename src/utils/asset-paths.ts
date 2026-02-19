import type { TilesetDef } from '../core/metadata-schema.js';

const TILESETS_BASE = '/assets/TimeFantasy_TILES_6.24.17/TILESETS';

export function tilesetImageUrl(ts: TilesetDef): string {
  return `${TILESETS_BASE}/${ts.tilesetImage}`;
}

export function loadTilesetImage(ts: TilesetDef): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = tilesetImageUrl(ts);
  });
}
