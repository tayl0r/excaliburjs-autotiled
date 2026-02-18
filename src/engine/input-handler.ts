import * as ex from 'excalibur';
import { AutotileTilemap } from './autotile-tilemap.js';

export type ToolMode = 'brush' | 'fill';

export class InputHandler {
  private engine: ex.Engine;
  private tilemap: AutotileTilemap;
  private activeColor: number = 2; // Default to Dirt (color 2)
  private isPainting = false;
  private toolMode: ToolMode = 'brush';
  private onColorChange?: (color: number) => void;
  private onToolModeChange?: (mode: ToolMode) => void;


  constructor(engine: ex.Engine, tilemap: AutotileTilemap) {
    this.engine = engine;
    this.tilemap = tilemap;
  }

  /** Set up pointer event listeners */
  initialize(): void {
    this.engine.input.pointers.primary.on('down', (evt) => {
      if (this.toolMode === 'fill') {
        this.fillAt(evt.worldPos);
      } else {
        this.isPainting = true;
        this.paintAt(evt.worldPos);
      }
    });

    this.engine.input.pointers.primary.on('move', (evt) => {
      if (this.isPainting && this.toolMode === 'brush') {
        this.paintAt(evt.worldPos);
      }
    });

    this.engine.input.pointers.primary.on('up', () => {
      this.isPainting = false;
    });
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

  private paintAt(worldPos: ex.Vector): void {
    const tilePos = this.tilemap.worldToTile(worldPos.x, worldPos.y);
    if (!tilePos) return;
    const [col, row] = tilePos;
    this.tilemap.paintTerrain(col, row, this.activeColor);
  }

  private fillAt(worldPos: ex.Vector): void {
    const tilePos = this.tilemap.worldToTile(worldPos.x, worldPos.y);
    if (!tilePos) return;
    const [col, row] = tilePos;
    this.tilemap.fillTerrain(col, row, this.activeColor);
  }

}
