/** The painted terrain color per grid cell. This is what the user paints. */
export interface AutotileMap {
  readonly width: number;
  readonly height: number;

  /** Get the painted terrain color at (x, y). Returns 0 if out of bounds or empty. */
  colorAt(x: number, y: number): number;

  /** Set the painted terrain color at (x, y) */
  setColorAt(x: number, y: number, color: number): void;

  /** Get the resolved tile ID at (x, y). Returns -1 if empty. */
  tileIdAt(x: number, y: number): number;

  /** Set the resolved tile at (x, y) */
  setTileAt(x: number, y: number, tileId: number): void;

  /** Check if (x, y) is within bounds */
  inBounds(x: number, y: number): boolean;
}

/** Simple in-memory implementation of AutotileMap */
export class SimpleAutotileMap implements AutotileMap {
  private colors: number[];
  private tiles: number[];

  constructor(public readonly width: number, public readonly height: number, defaultColor = 0) {
    this.colors = new Array(width * height).fill(defaultColor);
    this.tiles = new Array(width * height).fill(-1);
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

  tileIdAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return -1;
    return this.tiles[y * this.width + x];
  }

  setTileAt(x: number, y: number, tileId: number): void {
    if (!this.inBounds(x, y)) return;
    this.tiles[y * this.width + x] = tileId;
  }
}
