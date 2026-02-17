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

    const sprite = baseSprite.clone();
    if (cell.flipD) {
      // flipD means diagonal flip (transpose), decomposed into rotation + flip
      // for Excalibur's flipHorizontal/flipVertical/rotation properties
      if (!cell.flipH && !cell.flipV) {
        // flipD only: rotate 90° CW + flipH
        sprite.rotation = Math.PI / 2;
        sprite.flipHorizontal = true;
      } else if (cell.flipH && !cell.flipV) {
        // flipD + flipH: rotate 90° CW
        sprite.rotation = Math.PI / 2;
      } else if (!cell.flipH && cell.flipV) {
        // flipD + flipV: rotate -90° (270° CW)
        sprite.rotation = -Math.PI / 2;
      } else {
        // flipD + flipH + flipV: rotate 90° CW + flipV
        sprite.rotation = Math.PI / 2;
        sprite.flipVertical = true;
      }
    } else {
      sprite.flipHorizontal = cell.flipH;
      sprite.flipVertical = cell.flipV;
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
