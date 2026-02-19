import { EMPTY_CELL } from './cell.js';
import type { Cell } from './cell.js';

/** The painted terrain color per grid cell. This is what the user paints. */
export interface AutotileMap {
  readonly width: number;
  readonly height: number;

  /** Get the painted terrain color at (x, y). Returns 0 if out of bounds or empty. */
  colorAt(x: number, y: number): number;

  /** Set the painted terrain color at (x, y) */
  setColorAt(x: number, y: number, color: number): void;

  /** Get the resolved Cell at (x, y). Returns EMPTY_CELL if out of bounds or empty. */
  cellAt(x: number, y: number): Cell;

  /** Set the resolved Cell at (x, y) */
  setCellAt(x: number, y: number, cell: Cell): void;

  /** Check if (x, y) is within bounds */
  inBounds(x: number, y: number): boolean;
}

/** Simple in-memory implementation of AutotileMap */
export class SimpleAutotileMap implements AutotileMap {
  private colors: number[];
  private cells: Cell[];

  constructor(public readonly width: number, public readonly height: number, defaultColor = 0) {
    this.colors = new Array(width * height).fill(defaultColor);
    this.cells = new Array(width * height).fill(EMPTY_CELL);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  colorAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.colors[y * this.width + x];
  }

  setColorAt(x: number, y: number, color: number): void {
    if (!this.inBounds(x, y)) return;
    this.colors[y * this.width + x] = color;
  }

  cellAt(x: number, y: number): Cell {
    if (!this.inBounds(x, y)) return EMPTY_CELL;
    return this.cells[y * this.width + x];
  }

  setCellAt(x: number, y: number, cell: Cell): void {
    if (!this.inBounds(x, y)) return;
    this.cells[y * this.width + x] = cell;
  }

  /** Convenience read-only shorthand for cellAt(x,y).tileId */
  tileIdAt(x: number, y: number): number {
    return this.cellAt(x, y).tileId;
  }

  /** Returns a copy of the internal colors array (flat row-major) */
  getColors(): number[] {
    return this.colors.slice();
  }

  /** Overwrites colors array and resets all cells to EMPTY_CELL. Throws if length doesn't match dimensions. */
  importColors(colors: number[]): void {
    if (colors.length !== this.width * this.height) {
      throw new Error(`Color array length ${colors.length} doesn't match map dimensions ${this.width}x${this.height}`);
    }
    this.colors = colors.slice();
    this.cells = new Array(this.width * this.height).fill(EMPTY_CELL);
  }
}
