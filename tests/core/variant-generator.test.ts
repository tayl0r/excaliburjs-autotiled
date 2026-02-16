import { describe, it, expect } from 'vitest';
import { WangId } from '../../src/core/wang-id.js';
import { WangSet } from '../../src/core/wang-set.js';
import { WangColor } from '../../src/core/wang-color.js';
import { generateAllVariants } from '../../src/core/variant-generator.js';
import { DEFAULT_TRANSFORMATIONS, TransformationConfig } from '../../src/core/metadata-schema.js';

function makeColor(id: number, name: string): WangColor {
  return { id, name, color: '#000000', imageTileId: -1, probability: 1.0 };
}

describe('generateAllVariants', () => {
  it('generates base variants only when transforms disabled', () => {
    const ws = new WangSet('test', 'corner', [makeColor(1, 'A'), makeColor(2, 'B')]);
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 1, 0, 1, 0, 1]));
    ws.addTileMapping(1, WangId.fromArray([0, 2, 0, 2, 0, 2, 0, 2]));

    const variants = generateAllVariants(ws, DEFAULT_TRANSFORMATIONS);
    expect(variants).toHaveLength(2);
  });

  it('generates rotation variants when allowRotate', () => {
    const ws = new WangSet('test', 'corner', [makeColor(1, 'A'), makeColor(2, 'B')]);
    // Asymmetric tile: only TL corner is different
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 1, 0, 1, 0, 2]));

    const config: TransformationConfig = {
      ...DEFAULT_TRANSFORMATIONS,
      allowRotate: true,
    };
    const variants = generateAllVariants(ws, config);
    // 4 unique rotations for this asymmetric tile
    expect(variants).toHaveLength(4);
  });

  it('deduplicates symmetric tiles under rotation', () => {
    const ws = new WangSet('test', 'corner', [makeColor(1, 'A')]);
    // All-same tile: rotations are identical
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 1, 0, 1, 0, 1]));

    const config: TransformationConfig = {
      ...DEFAULT_TRANSFORMATIONS,
      allowRotate: true,
    };
    const variants = generateAllVariants(ws, config);
    expect(variants).toHaveLength(1); // All rotations produce same WangId
  });

  it('generates flipH variants', () => {
    const ws = new WangSet('test', 'corner', [makeColor(1, 'A'), makeColor(2, 'B')]);
    // Tile with TL=B, rest=A (asymmetric under H flip)
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 1, 0, 1, 0, 2]));

    const config: TransformationConfig = {
      ...DEFAULT_TRANSFORMATIONS,
      allowFlipH: true,
    };
    const variants = generateAllVariants(ws, config);
    expect(variants).toHaveLength(2); // Original + H-flipped

    // H-flip of [0,1,0,1,0,1,0,2] -> [0,2,0,1,0,1,0,1] (TL moves to TR)
    const flipped = variants.find(v => v.wangId.indexColor(1) === 2);
    expect(flipped).toBeDefined();
  });

  it('generates combined rotate + flipH variants', () => {
    const ws = new WangSet('test', 'corner', [makeColor(1, 'A'), makeColor(2, 'B')]);
    // Only one corner different
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 1, 0, 1, 0, 2]));

    const config: TransformationConfig = {
      ...DEFAULT_TRANSFORMATIONS,
      allowRotate: true,
      allowFlipH: true,
    };
    const variants = generateAllVariants(ws, config);
    // 4 rotations + 4 flipped = up to 8, but some may dedup
    // TL=B: 4 rotations give B at TL, TR, BR, BL
    // H-flip: each rotation flipped gives mirror versions
    // For single-corner-different, all 4 corner positions should be reachable
    // and they should all be unique
    expect(variants.length).toBeGreaterThanOrEqual(4);
    expect(variants.length).toBeLessThanOrEqual(8);
  });
});
