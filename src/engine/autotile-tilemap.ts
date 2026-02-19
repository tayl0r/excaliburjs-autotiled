import * as ex from 'excalibur';
import { SimpleAutotileMap } from '../core/autotile-map.js';
import type { WangSet } from '../core/wang-set.js';
import { applyTerrainPaint, resolveAllTiles } from '../core/terrain-painter.js';
import { floodFillTerrain } from '../core/flood-fill.js';
import type { WangSetData } from '../core/metadata-schema.js';
import { type Cell, createCell, EMPTY_CELL } from '../core/cell.js';
import { SpriteResolver } from './sprite-resolver.js';
import { AnimationController } from './animation-controller.js';

export class AutotileTilemap {
  readonly tileMap: ex.TileMap;
  readonly autoMap: SimpleAutotileMap;
  private wangSet: WangSet;
  private spriteResolver: SpriteResolver;
  private animController?: AnimationController;
  private _opacity = 1.0;

  constructor(
    columns: number,
    rows: number,
    tileWidth: number,
    tileHeight: number,
    wangSet: WangSet,
    spriteResolver: SpriteResolver,
    defaultColor: number = 1
  ) {
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
    this.refreshAffected(applyTerrainPaint(this.autoMap, this.wangSet, x, y, colorId));
  }

  /** Refresh the visual tile at (x, y) from the autoMap */
  refreshTile(x: number, y: number): void {
    const cell = this.autoMap.cellAt(x, y);
    if (cell.tileId < 0) {
      const tile = this.tileMap.getTile(x, y);
      if (tile) tile.clearGraphics();
      return;
    }
    this.renderCell(x, y, cell);
  }

  /** Initialize all tiles with a color */
  initializeAll(colorId: number): void {
    this.forEachCell((x, y) => {
      applyTerrainPaint(this.autoMap, this.wangSet, x, y, colorId);
    });
    this.refreshAllTiles();
  }

  /** Swap the WangSet and re-resolve all tiles from their painted colors */
  updateWangSet(wangSet: WangSet): void {
    this.wangSet = wangSet;
    this.forEachCell((x, y) => {
      const color = this.autoMap.colorAt(x, y);
      if (color > 0) {
        applyTerrainPaint(this.autoMap, this.wangSet, x, y, color);
      }
    });
    this.refreshAllTiles();
  }

  /** Fill terrain at (x, y) with flood fill and refresh affected tiles */
  fillTerrain(x: number, y: number, colorId: number): void {
    this.refreshAffected(floodFillTerrain(this.autoMap, this.wangSet, x, y, colorId));
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

    this.forEachCell((x, y) => {
      const cell = this.autoMap.cellAt(x, y);
      if (cell.tileId < 0) return;

      const animKey = this.animController!.getAnimationKey(cell.tilesetIndex, cell.tileId);
      if (!animKey || !changedSet.has(animKey)) return;

      const frame = this.animController!.getCurrentFrame(animKey);
      if (!frame || frame.tileId < 0) return;

      this.renderCell(x, y, createCell(frame.tileId, cell.flipH, cell.flipV, cell.flipD, frame.tileset));
    });
  }

  /** Set opacity (0-1) for this layer's tiles and refresh visuals */
  setOpacity(opacity: number): void {
    this._opacity = opacity;
    this.refreshAllTiles();
  }

  get opacity(): number {
    return this._opacity;
  }

  /** Import colors from an array, resolve tiles, and refresh visuals */
  loadColors(colors: number[], wangSet: WangSet): void {
    this.autoMap.importColors(colors);
    this.wangSet = wangSet;
    resolveAllTiles(this.autoMap, wangSet);
    this.refreshAllTiles();
  }

  /** Place a raw cell at (x, y), bypassing autotile logic */
  placeCell(x: number, y: number, cell: Cell): void {
    this.autoMap.setCellAt(x, y, cell);
    this.renderCell(x, y, cell);
  }

  /** Clear a cell at (x, y), setting it to EMPTY_CELL */
  clearCell(x: number, y: number): void {
    this.autoMap.setCellAt(x, y, EMPTY_CELL);
    const tile = this.tileMap.getTile(x, y);
    if (tile) tile.clearGraphics();
  }

  /** Apply a Cell's sprite to the TileMap at (x, y) */
  renderCell(x: number, y: number, cell: Cell): void {
    const tile = this.tileMap.getTile(x, y);
    if (!tile) return;
    tile.clearGraphics();
    const sprite = this.spriteResolver.resolve(cell);
    if (sprite) {
      if (this._opacity < 1.0) {
        const clone = sprite.clone();
        clone.opacity = this._opacity;
        tile.addGraphic(clone);
      } else {
        tile.addGraphic(sprite);
      }
    }
  }

  /** Refresh visuals for a list of [x, y] positions */
  private refreshAffected(positions: [number, number][]): void {
    for (const [ax, ay] of positions) {
      this.refreshTile(ax, ay);
    }
  }

  /** Run a callback for every cell in the map */
  private forEachCell(fn: (x: number, y: number) => void): void {
    for (let y = 0; y < this.autoMap.height; y++) {
      for (let x = 0; x < this.autoMap.width; x++) {
        fn(x, y);
      }
    }
  }

  /** Refresh the visual for every tile from the autoMap */
  refreshAllTiles(): void {
    this.forEachCell((x, y) => this.refreshTile(x, y));
  }

  /** Convert world position to tile coordinates */
  worldToTile(worldX: number, worldY: number): [number, number] | undefined {
    const col = Math.floor(worldX / this.tileMap.tileWidth);
    const row = Math.floor(worldY / this.tileMap.tileHeight);
    if (!this.autoMap.inBounds(col, row)) return undefined;
    return [col, row];
  }
}
