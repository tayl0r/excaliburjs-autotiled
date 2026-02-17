import type { WangSetData, WangTileData } from '../core/metadata-schema.js';

/**
 * For each neighbor direction (0-7, same as WangId indices),
 * defines which corner indices of the neighbor are constrained by which corner indices of the center.
 * Format: [neighborCornerIndex, centerCornerIndex][]
 */
const CORNER_CONSTRAINTS: [number, number][][] = [
  // 0: Top       — center.TL(7)→top.BL(5), center.TR(1)→top.BR(3)
  [[5, 7], [3, 1]],
  // 1: TopRight  — center.TR(1)→tr.BL(5)
  [[5, 1]],
  // 2: Right     — center.TR(1)→right.TL(7), center.BR(3)→right.BL(5)
  [[7, 1], [5, 3]],
  // 3: BottomRight — center.BR(3)→br.TL(7)
  [[7, 3]],
  // 4: Bottom    — center.BR(3)→bottom.TR(1), center.BL(5)→bottom.TL(7)
  [[1, 3], [7, 5]],
  // 5: BottomLeft — center.BL(5)→bl.TR(1)
  [[1, 5]],
  // 6: Left      — center.BL(5)→left.BR(3), center.TL(7)→left.TR(1)
  [[3, 5], [1, 7]],
  // 7: TopLeft   — center.TL(7)→tl.BR(3)
  [[3, 7]],
];

export interface AdjacencyResult {
  /** 9-element array in row-major order: [TL, T, TR, L, Center, R, BL, B, BR] */
  tiles: (AdjacencyTile | null)[];
}

export interface AdjacencyTile {
  tileId: number;
  wangid: number[];
}

/**
 * Given a center tile's WangId and the WangSet data, find the best matching
 * neighbor tile for each of the 8 directions.
 */
export function computeAdjacencyPreview(
  centerWangId: number[],
  ws: WangSetData,
): AdjacencyResult {
  // Grid order: TL(7), T(0), TR(1), L(6), Center, R(2), BL(5), B(4), BR(3)
  const directionToGrid = [1, 2, 5, 8, 7, 6, 3, 0]; // wangIndex -> grid position

  const tiles: (AdjacencyTile | null)[] = new Array(9).fill(null);

  // Center tile
  tiles[4] = { tileId: -1, wangid: centerWangId }; // tileId filled by caller

  for (let dir = 0; dir < 8; dir++) {
    const constraints = CORNER_CONSTRAINTS[dir];
    const match = findMatchingTile(centerWangId, constraints, ws);
    if (match) {
      tiles[directionToGrid[dir]] = match;
    }
  }

  return { tiles };
}

/**
 * Find a tile in the WangSet whose corners match the constraints imposed by the center tile.
 */
function findMatchingTile(
  centerWangId: number[],
  constraints: [number, number][],
  ws: WangSetData,
): AdjacencyTile | null {
  // Build a constraint map: neighborCornerIndex -> required color value
  const required = new Map<number, number>();
  for (const [neighborIdx, centerIdx] of constraints) {
    const color = centerWangId[centerIdx];
    if (color > 0) {
      required.set(neighborIdx, color);
    }
  }

  if (required.size === 0) return null;

  // Find best match: prefer tiles where ALL constrained corners match
  let bestMatch: WangTileData | null = null;
  let bestScore = -1;

  for (const wt of ws.wangtiles) {
    let score = 0;
    let valid = true;

    for (const [idx, reqColor] of required) {
      const tileColor = wt.wangid[idx];
      if (tileColor === reqColor) {
        score++;
      } else if (tileColor !== 0) {
        valid = false;
        break;
      }
    }

    if (valid && score > bestScore) {
      bestScore = score;
      bestMatch = wt;
    }
  }

  return bestMatch ? { tileId: bestMatch.tileid, wangid: bestMatch.wangid } : null;
}
