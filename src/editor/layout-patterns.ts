export interface LayoutPattern {
  name: string;
  width: number;
  height: number;
  /** Maps (col, row) to [TL, TR, BR, BL] corner assignments. 1=colorA, 2=colorB. */
  mapping: Map<string, [number, number, number, number]>;
}

function makeMapping(data: Array<[number, number, number, number, number, number]>): Map<string, [number, number, number, number]> {
  const map = new Map<string, [number, number, number, number]>();
  for (const [col, row, tl, tr, br, bl] of data) {
    map.set(`${col},${row}`, [tl, tr, br, bl]);
  }
  return map;
}

export const STANDARD_4X4_BINARY: LayoutPattern = {
  name: 'Standard 4x4 Binary',
  width: 4,
  height: 4,
  mapping: makeMapping([
    [0,0, 1,1,1,1], [1,0, 2,1,1,1], [2,0, 1,2,1,1], [3,0, 2,2,1,1],
    [0,1, 1,1,2,1], [1,1, 2,1,2,1], [2,1, 1,2,2,1], [3,1, 2,2,2,1],
    [0,2, 1,1,1,2], [1,2, 2,1,1,2], [2,2, 1,2,1,2], [3,2, 2,2,1,2],
    [0,3, 1,1,2,2], [1,3, 2,1,2,2], [2,3, 1,2,2,2], [3,3, 2,2,2,2],
  ]),
};

export const FANTASY_1X16: LayoutPattern = {
  name: 'Fantasy 1x16',
  width: 16,
  height: 1,
  mapping: makeMapping([
    // mapping: [col, row, TL, TR, BR, BL]
    // wangid indices: TL=7, TR=1, BR=3, BL=5
    [0,0,  1,1,1,1], [1,0,  2,1,1,1], [2,0,  1,2,1,1], [3,0,  2,2,1,1],
    [4,0,  1,1,1,2], [5,0,  2,1,1,2], [6,0,  1,2,1,2], [7,0,  2,2,1,2],
    [8,0,  1,1,2,1], [9,0,  2,1,2,1], [10,0, 1,2,2,1], [11,0, 2,2,2,1],
    [12,0, 1,1,2,2], [13,0, 2,1,2,2], [14,0, 1,2,2,2], [15,0, 2,2,2,2],
  ]),
};

export const ALL_PATTERNS: LayoutPattern[] = [STANDARD_4X4_BINARY, FANTASY_1X16];

/**
 * Apply a layout pattern to a rectangular region of tiles.
 * Returns an array of [tileId, wangid] pairs to assign.
 *
 * The origin tile is the top-left corner of the region.
 * For each (col, row) in the pattern mapping, the tile at
 * (originCol + col, originRow + row) gets the corresponding WangId.
 */
export function applyLayoutPattern(
  pattern: LayoutPattern,
  originTileId: number,
  columns: number,
  tileCount: number,
  colorA: number,
  colorB: number,
): Array<[number, number[]]> {
  const result: Array<[number, number[]]> = [];

  const originCol = originTileId % columns;
  const originRow = Math.floor(originTileId / columns);

  for (const [key, [tl, tr, br, bl]] of pattern.mapping) {
    const [pc, pr] = key.split(',').map(Number);
    const tileCol = originCol + pc;
    const tileRow = originRow + pr;
    const tileId = tileRow * columns + tileCol;

    if (tileCol >= columns || tileId >= tileCount || tileId < 0) continue;

    // Build WangId: edges=0, corners use colorA (1->colorA) or colorB (2->colorB)
    const resolve = (v: number) => v === 1 ? colorA : colorB;
    // WangId: [Top, TR, Right, BR, Bottom, BL, Left, TL]
    const wangid = [0, resolve(tr), 0, resolve(br), 0, resolve(bl), 0, resolve(tl)];
    result.push([tileId, wangid]);
  }

  return result;
}
