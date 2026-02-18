/** Convert (col, row) to tile ID given a tileset column count */
export function tileIdFromColRow(col: number, row: number, columns: number): number {
  return row * columns + col;
}

/** Convert tile ID to (col, row) given a tileset column count */
export function colRowFromTileId(tileId: number, columns: number): [col: number, row: number] {
  return [tileId % columns, Math.floor(tileId / columns)];
}

export interface TileBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

/** Compute the bounding rectangle (in col/row) for a set of tile IDs */
export function computeTileBounds(tileIds: Iterable<number>, columns: number): TileBounds {
  let minCol = Infinity, maxCol = -1, minRow = Infinity, maxRow = -1;
  for (const id of tileIds) {
    const [c, r] = colRowFromTileId(id, columns);
    minCol = Math.min(minCol, c);
    maxCol = Math.max(maxCol, c);
    minRow = Math.min(minRow, r);
    maxRow = Math.max(maxRow, r);
  }
  return { minCol, maxCol, minRow, maxRow };
}
