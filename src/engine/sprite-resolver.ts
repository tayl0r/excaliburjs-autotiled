import * as ex from 'excalibur';
import { Cell, cellSpriteKey } from '../core/cell.js';
import { colRowFromTileId } from '../utils/tile-math.js';

export class SpriteResolver {
  private spriteSheet: ex.SpriteSheet;
  private columns: number;
  private cache: Map<string, ex.Sprite> = new Map();

  constructor(spriteSheet: ex.SpriteSheet, columns: number) {
    this.spriteSheet = spriteSheet;
    this.columns = columns;
  }

  /** Resolve a Cell to an Excalibur Sprite, with caching */
  resolve(cell: Cell): ex.Sprite | undefined {
    const key = cellSpriteKey(cell);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const [col, row] = colRowFromTileId(cell.tileId, this.columns);
    const baseSprite = this.spriteSheet.getSprite(col, row);
    if (!baseSprite) return undefined;

    // Clone and apply flip flags (flipD deferred - not supported yet)
    const sprite = baseSprite.clone();
    if (cell.flipH) {
      sprite.flipHorizontal = true;
    }
    if (cell.flipV) {
      sprite.flipVertical = true;
    }

    this.cache.set(key, sprite);
    return sprite;
  }

  /** Resolve a raw tile ID (no transforms) to a Sprite */
  resolveById(tileId: number): ex.Sprite | undefined {
    const [col, row] = colRowFromTileId(tileId, this.columns);
    return this.spriteSheet.getSprite(col, row);
  }

  /** Clear the sprite cache */
  clearCache(): void {
    this.cache.clear();
  }
}
