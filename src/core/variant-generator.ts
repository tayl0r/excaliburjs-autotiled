import { WangSet, WangVariant } from './wang-set.js';
import { WangId } from './wang-id.js';
import { createCell, Cell } from './cell.js';
import { TransformationConfig } from './metadata-schema.js';

/**
 * Generate all tile variants (base + transformed) for a WangSet.
 * With transforms disabled, this just wraps each base tile as a variant.
 */
export function generateAllVariants(
  wangSet: WangSet,
  config: TransformationConfig
): WangVariant[] {
  const variants: WangVariant[] = [];
  const mappings = wangSet.getTileMappings();

  for (const { tilesetIndex, tileId, wangId: baseWangId } of mappings) {
    const baseCell = createCell(tileId, false, false, false, tilesetIndex);

    // Start with the original
    const orientations: Array<{ wangId: WangId; cell: Cell }> = [
      { wangId: baseWangId, cell: baseCell },
    ];

    // Add rotations (90, 180, 270 CW)
    if (config.allowRotate) {
      for (let r = 1; r <= 3; r++) {
        const rotatedWang = baseWangId.rotated(r);
        const rotatedCell = rotateCellCW(baseCell, r);
        orientations.push({ wangId: rotatedWang, cell: rotatedCell });
      }
    }

    // Add horizontal flips of all current orientations
    if (config.allowFlipH) {
      const toAdd: Array<{ wangId: WangId; cell: Cell }> = [];
      for (const { wangId, cell } of orientations) {
        toAdd.push({
          wangId: wangId.flippedHorizontally(),
          cell: flipCellH(cell),
        });
      }
      orientations.push(...toAdd);
    }

    // Add vertical flips of all current orientations
    if (config.allowFlipV) {
      const toAdd: Array<{ wangId: WangId; cell: Cell }> = [];
      for (const { wangId, cell } of orientations) {
        toAdd.push({
          wangId: wangId.flippedVertically(),
          cell: flipCellV(cell),
        });
      }
      orientations.push(...toAdd);
    }

    // Deduplicate by WangId key
    const seen = new Set<string>();
    for (const { wangId, cell } of orientations) {
      const key = wangId.toKey();
      if (!seen.has(key)) {
        seen.add(key);
        variants.push({ wangId, cell });
      }
    }
  }

  return variants;
}

/** Rotate a cell 90 CW n times using flip flags */
function rotateCellCW(cell: Cell, n: number): Cell {
  let { tileId, flipH, flipV, flipD, tilesetIndex } = cell;
  for (let i = 0; i < n; i++) {
    const newFlipH = flipV;
    const newFlipV = !flipH;
    const newFlipD = !flipD;
    flipH = newFlipH;
    flipV = newFlipV;
    flipD = newFlipD;
  }
  return createCell(tileId, flipH, flipV, flipD, tilesetIndex);
}

function flipCellH(cell: Cell): Cell {
  if (cell.flipD) {
    return createCell(cell.tileId, cell.flipH, !cell.flipV, cell.flipD, cell.tilesetIndex);
  }
  return createCell(cell.tileId, !cell.flipH, cell.flipV, cell.flipD, cell.tilesetIndex);
}

function flipCellV(cell: Cell): Cell {
  if (cell.flipD) {
    return createCell(cell.tileId, !cell.flipH, cell.flipV, cell.flipD, cell.tilesetIndex);
  }
  return createCell(cell.tileId, cell.flipH, !cell.flipV, cell.flipD, cell.tilesetIndex);
}
