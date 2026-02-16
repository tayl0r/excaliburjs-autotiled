/** Convert (col, row) to tile ID given a tileset column count */
export function tileIdFromColRow(col: number, row: number, columns: number): number {
  return row * columns + col;
}

/** Convert tile ID to (col, row) given a tileset column count */
export function colRowFromTileId(tileId: number, columns: number): [col: number, row: number] {
  return [tileId % columns, Math.floor(tileId / columns)];
}
