import { describe, it, expect } from 'vitest';
import { loadMetadata, validateProjectMetadata } from '../../src/core/metadata-loader.js';
import { ProjectMetadata } from '../../src/core/metadata-schema.js';

const validMetadata: ProjectMetadata = {
  version: 2,
  tilesets: [
    { tilesetImage: 'terrain.png', tileWidth: 16, tileHeight: 16, columns: 39, tileCount: 1482 },
  ],
  wangsets: [
    {
      name: 'Ground Terrain',
      type: 'corner',
      tile: 0,
      colors: [
        { name: 'Grass', color: '#00ff00', probability: 1.0, tile: 0 },
        { name: 'Dirt', color: '#8b4513', probability: 1.0, tile: 17 },
      ],
      wangtiles: [
        { tileid: 0, wangid: [0, 1, 0, 1, 0, 1, 0, 1] },
        { tileid: 1, wangid: [0, 2, 0, 1, 0, 1, 0, 1] },
        { tileid: 2, wangid: [0, 1, 0, 2, 0, 1, 0, 1] },
      ],
    },
  ],
};

describe('loadMetadata', () => {
  it('loads WangSets from valid metadata', () => {
    const { wangSets, transformations } = loadMetadata(validMetadata);
    expect(wangSets).toHaveLength(1);
    expect(wangSets[0].name).toBe('Ground Terrain');
    expect(wangSets[0].type).toBe('corner');
    expect(wangSets[0].colors).toHaveLength(2);
    expect(wangSets[0].tileCount).toBe(3);
  });

  it('loads default transformations when not specified', () => {
    const { transformations } = loadMetadata(validMetadata);
    expect(transformations.allowRotate).toBe(false);
    expect(transformations.allowFlipH).toBe(false);
  });

  it('loads WangIds correctly', () => {
    const { wangSets } = loadMetadata(validMetadata);
    const ws = wangSets[0];
    const w0 = ws.wangIdOf(0, 0);
    expect(w0).toBeDefined();
    expect(w0!.toArray()).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);

    const w1 = ws.wangIdOf(0, 1);
    expect(w1).toBeDefined();
    expect(w1!.indexColor(1)).toBe(2); // TopRight = Dirt
  });

  it('loads colors with correct 1-based IDs', () => {
    const { wangSets } = loadMetadata(validMetadata);
    const grass = wangSets[0].getColor(1);
    expect(grass).toBeDefined();
    expect(grass!.name).toBe('Grass');

    const dirt = wangSets[0].getColor(2);
    expect(dirt).toBeDefined();
    expect(dirt!.name).toBe('Dirt');
  });
});

describe('validateProjectMetadata', () => {
  it('returns no errors for valid metadata', () => {
    expect(validateProjectMetadata(validMetadata)).toEqual([]);
  });

  it('catches missing tilesetImage', () => {
    const bad: ProjectMetadata = {
      ...validMetadata,
      tilesets: [{ ...validMetadata.tilesets[0], tilesetImage: '' }],
    };
    const errors = validateProjectMetadata(bad);
    expect(errors).toContain('tilesets[0]: missing tilesetImage');
  });

  it('catches invalid tileWidth', () => {
    const bad: ProjectMetadata = {
      ...validMetadata,
      tilesets: [{ ...validMetadata.tilesets[0], tileWidth: 0 }],
    };
    expect(validateProjectMetadata(bad)).toContain('tilesets[0]: invalid tileWidth');
  });

  it('catches out-of-range tileids', () => {
    const bad: ProjectMetadata = {
      ...validMetadata,
      wangsets: [{
        ...validMetadata.wangsets[0],
        wangtiles: [{ tileid: 9999, wangid: [0, 1, 0, 1, 0, 1, 0, 1] }],
      }],
    };
    const errors = validateProjectMetadata(bad);
    expect(errors.some(e => e.includes('out of range'))).toBe(true);
  });

  it('catches invalid wangset type', () => {
    const bad: ProjectMetadata = {
      ...validMetadata,
      wangsets: [{
        ...validMetadata.wangsets[0],
        type: 'invalid' as any,
      }],
    };
    const errors = validateProjectMetadata(bad);
    expect(errors.some(e => e.includes('invalid type'))).toBe(true);
  });

  it('catches tileset index out of range', () => {
    const bad: ProjectMetadata = {
      ...validMetadata,
      wangsets: [{
        ...validMetadata.wangsets[0],
        wangtiles: [{ tileid: 0, wangid: [0, 1, 0, 1, 0, 1, 0, 1], tileset: 5 }],
      }],
    };
    const errors = validateProjectMetadata(bad);
    expect(errors.some(e => e.includes('tileset index'))).toBe(true);
  });
});
