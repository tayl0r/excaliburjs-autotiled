import { AutotileMap } from './autotile-map.js';
import { WangSet } from './wang-set.js';
import { WangId } from './wang-id.js';
import { findBestMatch } from './matching.js';

/** All 8-direction neighbor offsets for BFS intermediate insertion */
const ALL_DIRECTIONS: [number, number][] = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/**
 * Paint a terrain color at (x, y) and update all affected tiles.
 * Returns the list of (x, y) positions that were updated.
 *
 * When the painted color is not directly compatible with a neighbor
 * (color distance > 1), intermediate colors are auto-inserted via BFS
 * using the next-hop matrix. This creates smooth transitions like:
 *   [Dirt] [Dirt→Grass] [Grass→Sand] [Sand]
 */
export function applyTerrainPaint(
  map: AutotileMap,
  wangSet: WangSet,
  x: number,
  y: number,
  color: number
): Array<[number, number]> {
  // 1. Set the painted color
  map.setColorAt(x, y, color);

  // 2. Auto-insert intermediates from the single painted cell
  const colorChanged = insertIntermediates(map, wangSet, [[x, y]]);

  // 3. Expand, sort, recompute
  return recomputeTiles(map, wangSet, colorChanged, x, y);
}

/**
 * BFS outward from seed positions to insert intermediate colors where
 * color distance > 1. Returns the set of all positions whose color changed
 * (including the seeds themselves).
 */
export function insertIntermediates(
  map: AutotileMap,
  wangSet: WangSet,
  seedPositions: Array<[number, number]>
): Set<string> {
  const colorChanged = new Set<string>();
  const queue: [number, number][] = [];
  const visited = new Set<string>();

  for (const [sx, sy] of seedPositions) {
    const key = `${sx},${sy}`;
    colorChanged.add(key);
    visited.add(key);
    queue.push([sx, sy]);
  }

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    const myColor = map.colorAt(cx, cy);

    for (const [dx, dy] of ALL_DIRECTIONS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!map.inBounds(nx, ny)) continue;

      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;

      const neighborColor = map.colorAt(nx, ny);
      if (neighborColor === 0) continue;

      const dist = wangSet.colorDistance(myColor, neighborColor);
      if (dist > 1) {
        // Need intermediate: change neighbor to the next hop from my color toward theirs
        const intermediate = wangSet.nextHopColor(myColor, neighborColor);
        map.setColorAt(nx, ny, intermediate);
        colorChanged.add(key);
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
  }

  return colorChanged;
}

/**
 * Expand affected region by ±1 ring, sort center-outward, recompute tiles.
 * Returns the list of affected positions.
 */
export function recomputeTiles(
  map: AutotileMap,
  wangSet: WangSet,
  colorChanged: Set<string>,
  centerX: number,
  centerY: number
): Array<[number, number]> {
  // Expand affected region: all color-changed cells + ±1 ring for tile corner propagation
  const affectedSet = new Set<string>();
  for (const key of colorChanged) {
    const [cx, cy] = key.split(',').map(Number);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (map.inBounds(nx, ny)) {
          affectedSet.add(`${nx},${ny}`);
        }
      }
    }
  }

  // Sort affected positions center-outward (Manhattan distance from center)
  const affected: Array<[number, number]> = [];
  for (const key of affectedSet) {
    const [ax, ay] = key.split(',').map(Number);
    affected.push([ax, ay]);
  }
  affected.sort(
    (a, b) =>
      (Math.abs(a[0] - centerX) + Math.abs(a[1] - centerY)) -
      (Math.abs(b[0] - centerX) + Math.abs(b[1] - centerY))
  );

  // Recompute tiles center-outward
  for (const [ax, ay] of affected) {
    const cellColor = map.colorAt(ax, ay);
    if (cellColor === 0) continue;

    const desired = desiredWangIdFromColors(map, ax, ay, wangSet.type);
    const cell = findBestMatch(wangSet, desired, wangSet.type);

    if (cell) {
      map.setCellAt(ax, ay, cell);
    }
  }

  return affected;
}

/**
 * Compute the desired WangId for tile at (x,y) directly from painted terrain colors.
 *
 * For corner-type WangSets, each corner corresponds to a terrain grid vertex.
 * The vertex mapping treats painted cell colors as vertex values:
 *   Corner 7 (TL) = painted color at (x, y)       [cell itself]
 *   Corner 1 (TR) = painted color at (x+1, y)     [right neighbor]
 *   Corner 3 (BR) = painted color at (x+1, y+1)   [bottom-right neighbor]
 *   Corner 5 (BL) = painted color at (x, y+1)     [bottom neighbor]
 *
 * This ensures consistent corners at shared tile boundaries:
 *   tile(x,y).TR = tile(x+1,y).TL  (both use painted color at x+1,y)
 */
function desiredWangIdFromColors(
  map: AutotileMap,
  x: number,
  y: number,
  type: 'corner' | 'edge' | 'mixed'
): WangId {
  const colors = [0, 0, 0, 0, 0, 0, 0, 0];
  const selfColor = map.colorAt(x, y);

  if (type === 'corner') {
    // Corner vertex mapping: [wangIndex, dx, dy]
    const CORNER_VERTICES: [number, number, number][] = [
      [7, 0, 0],   // TL = self
      [1, 1, 0],   // TR = right
      [3, 1, 1],   // BR = bottom-right
      [5, 0, 1],   // BL = bottom
    ];

    for (const [index, dx, dy] of CORNER_VERTICES) {
      const nx = x + dx;
      const ny = y + dy;
      colors[index] = map.inBounds(nx, ny) ? map.colorAt(nx, ny) : selfColor;
    }
  } else {
    // Edge/mixed: use painted colors of direct neighbors
    // Edge indices: 0(T), 2(R), 4(B), 6(L)
    // Corner indices: 1(TR), 3(BR), 5(BL), 7(TL)
    const NEIGHBOR_OFFSETS: [number, number][] = [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ];

    for (let i = 0; i < 8; i++) {
      const isCorner = i % 2 === 1;
      if (type === 'edge' && isCorner) continue;

      const [dx, dy] = NEIGHBOR_OFFSETS[i];
      const nx = x + dx;
      const ny = y + dy;
      colors[i] = map.inBounds(nx, ny) ? map.colorAt(nx, ny) : selfColor;
    }
  }

  return new WangId(colors);
}
