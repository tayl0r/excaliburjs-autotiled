import { WangSet } from './wang-set.js';

export interface ColorDistanceResult {
  distances: number[][];
  nextHop: number[][];
}

/**
 * Build a distance matrix between all colors using Floyd-Warshall.
 * Distance 0 = same color
 * Distance 1 = direct transition exists (a tile has both colors)
 * Distance N = N intermediate transitions needed
 * Distance -1 = no path exists
 *
 * Also builds a next-hop matrix: nextHop[i][j] = first color to visit
 * on the shortest path from i to j.
 */
export function computeColorDistances(wangSet: WangSet): ColorDistanceResult {
  const n = wangSet.colors.length + 1; // +1 because colors are 1-based
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));
  const nextHop: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));

  // Self-distance = 0
  for (let i = 1; i < n; i++) {
    dist[i][i] = 0;
    nextHop[i][i] = i;
  }

  // Find direct transitions from existing tiles
  const mappings = wangSet.getTileMappings();
  for (const [, wangId] of mappings) {
    const colorsInTile = new Set<number>();
    for (let idx = 0; idx < 8; idx++) {
      const c = wangId.indexColor(idx);
      if (c > 0) colorsInTile.add(c);
    }

    // All color pairs in this tile have distance 1
    for (const a of colorsInTile) {
      for (const b of colorsInTile) {
        if (a !== b) {
          dist[a][b] = 1;
          dist[b][a] = 1;
          nextHop[a][b] = b;
          nextHop[b][a] = a;
        }
      }
    }
  }

  // Floyd-Warshall: find shortest paths
  for (let k = 1; k < n; k++) {
    for (let i = 1; i < n; i++) {
      for (let j = 1; j < n; j++) {
        if (i === j) continue;
        if (dist[i][k] < 0 || dist[k][j] < 0) continue;
        const newDist = dist[i][k] + dist[k][j];
        if (dist[i][j] < 0 || newDist < dist[i][j]) {
          dist[i][j] = newDist;
          nextHop[i][j] = nextHop[i][k];
        }
      }
    }
  }

  return { distances: dist, nextHop };
}
