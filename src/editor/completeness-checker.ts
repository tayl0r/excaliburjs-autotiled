import { WangSetData } from '../core/metadata-schema.js';

export interface MissingCombination {
  /** Corner colors: [TL, TR, BR, BL] using 1-based color IDs */
  corners: [tl: number, tr: number, br: number, bl: number];
}

export interface CompletenessResult {
  total: number;
  matched: number;
  missing: MissingCombination[];
}

/**
 * Check how many of the possible corner combinations in a WangSet
 * are covered by at least one tagged tile.
 *
 * Only supports corner-type WangSets (indices 1, 3, 5, 7).
 */
export function checkCompleteness(ws: WangSetData): CompletenessResult {
  const colorCount = ws.colors.length;
  if (colorCount === 0) {
    return { total: 0, matched: 0, missing: [] };
  }

  // Build a set of present corner combinations from wangtiles
  // Key format: "TL,TR,BR,BL"
  const present = new Set<string>();
  for (const wt of ws.wangtiles) {
    const tl = wt.wangid[7];
    const tr = wt.wangid[1];
    const br = wt.wangid[3];
    const bl = wt.wangid[5];
    present.add(`${tl},${tr},${br},${bl}`);
  }

  // Enumerate all possible combinations
  const missing: MissingCombination[] = [];
  let total = 0;

  for (let tl = 1; tl <= colorCount; tl++) {
    for (let tr = 1; tr <= colorCount; tr++) {
      for (let br = 1; br <= colorCount; br++) {
        for (let bl = 1; bl <= colorCount; bl++) {
          total++;
          if (!present.has(`${tl},${tr},${br},${bl}`)) {
            missing.push({ corners: [tl, tr, br, bl] });
          }
        }
      }
    }
  }

  return { total, matched: total - missing.length, missing };
}
