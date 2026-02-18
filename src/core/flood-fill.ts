import type { AutotileMap } from './autotile-map.js';
import type { WangSet } from './wang-set.js';
import { insertIntermediates, recomputeTiles } from './terrain-painter.js';

/** 4-directional offsets for flood fill connectivity */
const FOUR_DIRECTIONS: [number, number][] = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
];

/**
 * Flood fill a terrain color starting from (startX, startY).
 * Uses 4-directional connectivity to find all connected cells with the same color,
 * replaces them with newColor, inserts intermediates at boundaries, and recomputes tiles.
 *
 * Returns the list of affected positions (filled cells + recomputed neighbors).
 */
export function floodFillTerrain(
  map: AutotileMap,
  wangSet: WangSet,
  startX: number,
  startY: number,
  newColor: number
): Array<[number, number]> {
  if (!map.inBounds(startX, startY)) return [];

  const oldColor = map.colorAt(startX, startY);
  if (oldColor === 0) return [];

  // 1. BFS to find all connected cells with oldColor (4-directional)
  const filled: Array<[number, number]> = [];
  const visited = new Set<string>();
  const queue: [number, number][] = [[startX, startY]];
  visited.add(`${startX},${startY}`);

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    filled.push([cx, cy]);

    for (const [dx, dy] of FOUR_DIRECTIONS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!map.inBounds(nx, ny)) continue;

      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (map.colorAt(nx, ny) === oldColor) {
        queue.push([nx, ny]);
      }
    }
  }

  // 2. Set all filled cells to newColor
  for (const [fx, fy] of filled) {
    map.setColorAt(fx, fy, newColor);
  }

  // 3. Find boundary cells (filled cells adjacent to non-filled cells)
  const filledKeys = new Set(filled.map(([x, y]) => `${x},${y}`));
  const boundary = filled.filter(([fx, fy]) =>
    FOUR_DIRECTIONS.some(([dx, dy]) => {
      const nx = fx + dx;
      const ny = fy + dy;
      return !map.inBounds(nx, ny) || !filledKeys.has(`${nx},${ny}`);
    })
  );

  // 4. Insert intermediates from boundary cells outward
  const seedPositions = boundary.length > 0 ? boundary : filled;
  const colorChanged = insertIntermediates(map, wangSet, seedPositions);

  // Also include all filled cells as changed (even interior ones)
  for (const [fx, fy] of filled) {
    colorChanged.add(`${fx},${fy}`);
  }

  // 5. Recompute tiles for affected region (centered on start for sort order)
  return recomputeTiles(map, wangSet, colorChanged, startX, startY);
}
