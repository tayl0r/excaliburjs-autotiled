import type { AutotileMap } from './autotile-map.js';
import type { Cell } from './cell.js';
import { RandomPicker } from './random-picker.js';
import { WangId, NEIGHBOR_OFFSETS, isActiveIndex } from './wang-id.js';
import type { WangSet } from './wang-set.js';

/**
 * Build a desired WangId from the 8 neighbors of position (x, y).
 * For each neighbor, reads its WangId and extracts the color on the shared boundary.
 */
export function wangIdFromSurroundings(
  map: AutotileMap,
  x: number,
  y: number,
  wangSet: WangSet
): WangId {
  const colors = [0, 0, 0, 0, 0, 0, 0, 0];

  for (let index = 0; index < 8; index++) {
    const [dx, dy] = NEIGHBOR_OFFSETS[index];
    const nx = x + dx;
    const ny = y + dy;

    if (!map.inBounds(nx, ny)) continue;

    const neighborCell = map.cellAt(nx, ny);
    if (neighborCell.tileId < 0) {
      colors[index] = map.colorAt(nx, ny);
      continue;
    }

    const neighborWangId = wangSet.wangIdOf(neighborCell.tilesetIndex, neighborCell.tileId);
    if (!neighborWangId) continue;

    colors[index] = neighborWangId.indexColor(WangId.oppositeIndex(index));
  }

  return new WangId(colors);
}

/**
 * Find the best matching tile from the WangSet's variants for a desired WangId.
 * Uses soft-constraint penalty scoring based on color distance.
 * Exact matches get penalty 0; close matches get low penalty via color distance.
 * Unreachable colors (distance < 0) are rejected.
 */
export function findBestMatch(
  wangSet: WangSet,
  desired: WangId,
  type: 'corner' | 'edge' | 'mixed'
): Cell | undefined {
  let lowestPenalty = Infinity;
  const candidates = new RandomPicker<Cell>();

  for (const { wangId, cell } of wangSet.allVariants()) {
    let totalPenalty = 0;
    let valid = true;

    for (let i = 0; i < 8; i++) {
      if (!isActiveIndex(i, type)) continue;
      const desiredColor = desired.indexColor(i);
      const candidateColor = wangId.indexColor(i);

      if (desiredColor === 0 || candidateColor === 0) continue;
      if (desiredColor === candidateColor) continue;

      const distance = wangSet.colorDistance(desiredColor, candidateColor);
      if (distance < 0) {
        valid = false;
        break;
      }
      totalPenalty += distance;
    }

    if (!valid) continue;

    if (totalPenalty < lowestPenalty) {
      candidates.clear();
      lowestPenalty = totalPenalty;
    }

    if (totalPenalty === lowestPenalty) {
      const probability = wangSet.wangIdProbability(wangId) * wangSet.tileProbability(cell.tilesetIndex, cell.tileId);
      candidates.add(cell, probability);
    }
  }

  return candidates.pick();
}
