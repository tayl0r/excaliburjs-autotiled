import * as ex from 'excalibur';
import { SimpleAutotileMap } from '../core/autotile-map.js';
import { WangSet } from '../core/wang-set.js';
import { applyTerrainPaint } from '../core/terrain-painter.js';
import { floodFillTerrain } from '../core/flood-fill.js';
import { WangSetData } from '../core/metadata-schema.js';
import { createCell } from '../core/cell.js';
import { SpriteResolver } from './sprite-resolver.js';
import { AnimationController } from './animation-controller.js';

export class AutotileTilemap {
  readonly tileMap: ex.TileMap;
  readonly autoMap: SimpleAutotileMap;
  private wangSet: WangSet;
  private spriteResolver: SpriteResolver;
  private tileWidth: number;
  private tileHeight: number;
  private animController?: AnimationController;

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
    const cell = this.autoMap.cellAt(x, y);
    if (cell.tileId < 0) return;

    const tile = this.tileMap.getTile(x, y);
    if (!tile) return;

    tile.clearGraphics();

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

  /** Swap the WangSet and re-resolve all tiles from their painted colors */
  updateWangSet(wangSet: WangSet): void {
    this.wangSet = wangSet;
    for (let y = 0; y < this.autoMap.height; y++) {
      for (let x = 0; x < this.autoMap.width; x++) {
        const color = this.autoMap.colorAt(x, y);
        if (color > 0) {
          applyTerrainPaint(this.autoMap, this.wangSet, x, y, color);
        }
      }
    }
    for (let y = 0; y < this.autoMap.height; y++) {
      for (let x = 0; x < this.autoMap.width; x++) {
        this.refreshTile(x, y);
      }
    }
  }

  /** Fill terrain at (x, y) with flood fill and refresh affected tiles */
  fillTerrain(x: number, y: number, colorId: number): void {
    const affected = floodFillTerrain(this.autoMap, this.wangSet, x, y, colorId);

    for (const [ax, ay] of affected) {
      this.refreshTile(ax, ay);
    }
  }

  /** Set up animations from wangset wangtiles with animation data */
  setAnimationsFromWangSets(wangsets: WangSetData[]): void {
    const controller = new AnimationController();
    for (const ws of wangsets) {
      for (const wt of ws.wangtiles) {
        if (wt.animation) {
          controller.addTileAnimation(wt.tileid, wt.tileset ?? 0, wt.animation);
        }
      }
    }
    this.animController = controller.isEmpty ? undefined : controller;
  }

  /** Advance animation state and re-render affected cells */
  updateAnimations(deltaMs: number): void {
    if (!this.animController) return;

    const changed = this.animController.update(deltaMs);
    if (changed.length === 0) return;

    const changedSet = new Set(changed);

    // For each cell, check if it belongs to a changed animation
    for (let y = 0; y < this.autoMap.height; y++) {
      for (let x = 0; x < this.autoMap.width; x++) {
        const cell = this.autoMap.cellAt(x, y);
        if (cell.tileId < 0) continue;

        const animKey = this.animController.getAnimationKey(cell.tilesetIndex, cell.tileId);
        if (!animKey || !changedSet.has(animKey)) continue;

        const frame = this.animController.getCurrentFrame(animKey);
        if (!frame || frame.tileId < 0) continue;

        const tile = this.tileMap.getTile(x, y);
        if (!tile) continue;

        tile.clearGraphics();
        const animatedCell = createCell(
          frame.tileId,
          cell.flipH,
          cell.flipV,
          cell.flipD,
          frame.tileset
        );
        const sprite = this.spriteResolver.resolve(animatedCell);
        if (sprite) {
          tile.addGraphic(sprite);
        }
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
