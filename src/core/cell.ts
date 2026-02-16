/** A placed tile on the map */
export interface Cell {
  tileId: number;
  flipH: boolean;
  flipV: boolean;
  flipD: boolean;
}

export function createCell(tileId: number, flipH = false, flipV = false, flipD = false): Cell {
  return { tileId, flipH, flipV, flipD };
}

export const EMPTY_CELL: Cell = { tileId: -1, flipH: false, flipV: false, flipD: false };

export function isCellEmpty(cell: Cell): boolean {
  return cell.tileId < 0;
}

/** Create a unique key for sprite caching */
export function cellSpriteKey(cell: Cell): string {
  return `${cell.tileId}:${cell.flipH ? 1 : 0}:${cell.flipV ? 1 : 0}:${cell.flipD ? 1 : 0}`;
}
