import { WangId, NEIGHBOR_OFFSETS, isActiveIndex } from './wang-id.js';
import { WangSet } from './wang-set.js';
import { Cell } from './cell.js';
import { AutotileMap } from './autotile-map.js';
import { RandomPicker } from './random-picker.js';

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

    if (!map.inBounds(nx, ny)) {
      colors[index] = 0; // Out of bounds = wildcard
      continue;
    }

    const neighborCell = map.cellAt(nx, ny);
    if (neighborCell.tileId < 0) {
      // No tile placed, use painted color as a hint
      const neighborColor = map.colorAt(nx, ny);
      if (neighborColor > 0) {
        // For the neighbor's color, we want the OPPOSITE index's value
        // Since the neighbor is painted as a solid color, all its corners/edges are that color
        colors[index] = neighborColor;
      }
      continue;
    }

    const neighborWangId = wangSet.wangIdOf(neighborCell.tilesetIndex, neighborCell.tileId);
    if (!neighborWangId) {
      colors[index] = 0; // Unknown tile, wildcard
      continue;
    }

    // The color on our side = the opposite side of the neighbor
    const oppositeIdx = WangId.oppositeIndex(index);
    colors[index] = neighborWangId.indexColor(oppositeIdx);
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
  const variants = wangSet.allVariants();

  for (const { wangId, cell } of variants) {
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
