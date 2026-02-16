import * as ex from 'excalibur';
import { SimpleAutotileMap } from '../core/autotile-map.js';
import { WangSet } from '../core/wang-set.js';
import { createCell } from '../core/cell.js';
import { applyTerrainPaint } from '../core/terrain-painter.js';
import { SpriteResolver } from './sprite-resolver.js';

export class AutotileTilemap {
  readonly tileMap: ex.TileMap;
  readonly autoMap: SimpleAutotileMap;
  private wangSet: WangSet;
  private spriteResolver: SpriteResolver;
  private tileWidth: number;
  private tileHeight: number;

  constructor(
    columns: number,
    rows: number,
    tileWidth: number,
    tileHeight: number,
    wangSet: WangSet,
    spriteResolver: SpriteResolver,
    defaultColor: number = 1
  ) {
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.wangSet = wangSet;
    this.spriteResolver = spriteResolver;

    this.autoMap = new SimpleAutotileMap(columns, rows, defaultColor);

    this.tileMap = new ex.TileMap({
      rows,
      columns,
      tileWidth,
      tileHeight,
    });
  }

  /** Paint terrain at (x, y) and refresh affected tiles */
  paintTerrain(x: number, y: number, colorId: number): void {
    const affected = applyTerrainPaint(this.autoMap, this.wangSet, x, y, colorId);

    for (const [ax, ay] of affected) {
      this.refreshTile(ax, ay);
    }
  }

  /** Refresh the visual tile at (x, y) from the autoMap */
  refreshTile(x: number, y: number): void {
    const tileId = this.autoMap.tileIdAt(x, y);
    if (tileId < 0) return;

    const tile = this.tileMap.getTile(x, y);
    if (!tile) return;

    tile.clearGraphics();

    const cell = createCell(tileId);
    const sprite = this.spriteResolver.resolve(cell);
    if (sprite) {
      tile.addGraphic(sprite);
    }
  }

  /** Initialize all tiles with a color */
  initializeAll(colorId: number): void {
    for (let y = 0; y < this.autoMap.height; y++) {
      for (let x = 0; x < this.autoMap.width; x++) {
        applyTerrainPaint(this.autoMap, this.wangSet, x, y, colorId);
      }
    }
    for (let y = 0; y < this.autoMap.height; y++) {
      for (let x = 0; x < this.autoMap.width; x++) {
        this.refreshTile(x, y);
      }
    }
  }

  /** Convert world position to tile coordinates */
  worldToTile(worldX: number, worldY: number): [number, number] | undefined {
    const col = Math.floor(worldX / this.tileWidth);
    const row = Math.floor(worldY / this.tileHeight);
    if (!this.autoMap.inBounds(col, row)) return undefined;
    return [col, row];
  }
}
