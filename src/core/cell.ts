/** A placed tile on the map */
export interface Cell {
  tileId: number;
  tilesetIndex: number;
  flipH: boolean;
  flipV: boolean;
  flipD: boolean;
}

export function createCell(tileId: number, flipH = false, flipV = false, flipD = false, tilesetIndex = 0): Cell {
  return { tileId, tilesetIndex, flipH, flipV, flipD };
}

export const EMPTY_CELL: Cell = { tileId: -1, tilesetIndex: 0, flipH: false, flipV: false, flipD: false };

export function isCellEmpty(cell: Cell): boolean {
  return cell.tileId < 0;
}

/** Create a unique key for sprite caching */
export function cellSpriteKey(cell: Cell): string {
  return `${cell.tilesetIndex}:${cell.tileId}:${cell.flipH ? 1 : 0}:${cell.flipV ? 1 : 0}:${cell.flipD ? 1 : 0}`;
}
