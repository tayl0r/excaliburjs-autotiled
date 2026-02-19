import * as ex from 'excalibur';
import { AutotileTilemap } from './autotile-tilemap.js';

export type ToolMode = 'brush' | 'fill' | 'prefab';
export type BrushSize = 1 | 3 | 10;

export class InputHandler {
  private engine: ex.Engine;
  private tilemap: AutotileTilemap;
  private activeColor: number = 2; // Default to Dirt (color 2)
  private isPainting = false;
  private toolMode: ToolMode = 'brush';
  private _brushSize: BrushSize = 1;
  private onColorChange?: (color: number) => void;
  private onToolModeChange?: (mode: ToolMode) => void;
  private onBrushSizeChange?: (size: BrushSize) => void;
  private cursorTilePos: [number, number] | null = null;
  private onCursorMove?: (pos: [number, number] | null) => void;
  private onPrefabPlace?: (tileX: number, tileY: number) => void;
  private onMapChanged?: () => void;

  constructor(engine: ex.Engine, tilemap: AutotileTilemap) {
    this.engine = engine;
    this.tilemap = tilemap;
  }

  /** Switch the tilemap this handler targets (for layer switching) */
  setTilemap(tilemap: AutotileTilemap): void {
    this.tilemap = tilemap;
  }

  /** Set up pointer event listeners */
  initialize(): void {
    this.engine.input.pointers.primary.on('down', (evt) => {
      if (this.toolMode === 'prefab') {
        const tilePos = this.tilemap.worldToTile(evt.worldPos.x, evt.worldPos.y);
        if (tilePos) this.onPrefabPlace?.(tilePos[0], tilePos[1]);
        return;
      }
      if (this.toolMode === 'fill') {
        this.fillAt(evt.worldPos);
        this.onMapChanged?.();
      } else {
        this.isPainting = true;
        this.applyBrush(evt.worldPos);
      }
    });

    this.engine.input.pointers.primary.on('move', (evt) => {
      const tilePos = this.tilemap.worldToTile(evt.worldPos.x, evt.worldPos.y);
      const newPos = tilePos ?? null;
      const changed = !this.posEqual(this.cursorTilePos, newPos);
      this.cursorTilePos = newPos;
      if (changed) this.onCursorMove?.(newPos);

      if (this.isPainting && this.toolMode === 'brush') {
        this.applyBrush(evt.worldPos);
      }
    });

    this.engine.input.pointers.primary.on('up', () => {
      if (this.isPainting) {
        this.isPainting = false;
        this.onMapChanged?.();
      }
    });

    this.engine.input.pointers.primary.on('leave', () => {
      if (this.cursorTilePos !== null) {
        this.cursorTilePos = null;
        this.onCursorMove?.(null);
      }
    });
  }

  private posEqual(a: [number, number] | null, b: [number, number] | null): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return a[0] === b[0] && a[1] === b[1];
  }

  /** Set the active terrain color */
  setActiveColor(color: number): void {
    this.activeColor = color;
    this.onColorChange?.(color);
  }

  getActiveColor(): number {
    return this.activeColor;
  }

  setOnColorChange(callback: (color: number) => void): void {
    this.onColorChange = callback;
  }

  setToolMode(mode: ToolMode): void {
    this.toolMode = mode;
    this.onToolModeChange?.(mode);
  }

  getToolMode(): ToolMode {
    return this.toolMode;
  }

  setOnToolModeChange(callback: (mode: ToolMode) => void): void {
    this.onToolModeChange = callback;
  }

  setBrushSize(size: BrushSize): void {
    this._brushSize = size;
    this.onBrushSizeChange?.(size);
  }

  get brushSize(): BrushSize {
    return this._brushSize;
  }

  setOnBrushSizeChange(callback: (size: BrushSize) => void): void {
    this.onBrushSizeChange = callback;
  }

  setOnCursorMove(callback: (pos: [number, number] | null) => void): void {
    this.onCursorMove = callback;
  }

  setOnPrefabPlace(callback: (tileX: number, tileY: number) => void): void {
    this.onPrefabPlace = callback;
  }

  setOnMapChanged(callback: () => void): void {
    this.onMapChanged = callback;
  }

  /** Apply brush at the given world position using current brush size */
  private applyBrush(worldPos: ex.Vector): void {
    const tilePos = this.tilemap.worldToTile(worldPos.x, worldPos.y);
    if (!tilePos) return;

    const half = Math.floor(this._brushSize / 2);
    const [cx, cy] = tilePos;

    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        this.tilemap.paintTerrain(cx + dx, cy + dy, this.activeColor);
      }
    }
  }

  private fillAt(worldPos: ex.Vector): void {
    const tilePos = this.tilemap.worldToTile(worldPos.x, worldPos.y);
    if (!tilePos) return;
    this.tilemap.fillTerrain(tilePos[0], tilePos[1], this.activeColor);
  }
}
