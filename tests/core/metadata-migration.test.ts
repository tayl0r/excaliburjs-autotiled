import { describe, it, expect } from 'vitest';
import { migrateToProjectMetadata } from '../../src/core/metadata-migration.js';
import { TilesetMetadata, ProjectMetadata } from '../../src/core/metadata-schema.js';

const legacyMetadata: TilesetMetadata = {
  tilesetImage: 'terrain.png',
  tileWidth: 16,
  tileHeight: 16,
  columns: 39,
  tileCount: 1482,
  transformations: {
    allowRotate: false,
    allowFlipH: false,
    allowFlipV: false,
    preferUntransformed: true,
  },
  wangsets: [
    {
      name: 'Ground',
      type: 'corner',
      tile: 0,
      colors: [
        { name: 'Grass', color: '#00ff00', probability: 1.0, tile: 0 },
        { name: 'Dirt', color: '#8b4513', probability: 1.0, tile: 15 },
      ],
      wangtiles: [
        { tileid: 0, wangid: [0, 1, 0, 1, 0, 1, 0, 1] },
        { tileid: 15, wangid: [0, 2, 0, 2, 0, 2, 0, 2], probability: 0.5 },
      ],
    },
  ],
};

describe('migrateToProjectMetadata', () => {
  it('converts legacy TilesetMetadata to ProjectMetadata', () => {
    const result = migrateToProjectMetadata(legacyMetadata);
    expect(result.version).toBe(2);
    expect(result.tilesets).toHaveLength(1);
    expect(result.tilesets[0].tilesetImage).toBe('terrain.png');
    expect(result.tilesets[0].tileWidth).toBe(16);
    expect(result.tilesets[0].columns).toBe(39);
    expect(result.tilesets[0].tileCount).toBe(1482);
  });

  it('preserves wangsets with tileset: 0 injected', () => {
    const result = migrateToProjectMetadata(legacyMetadata);
    expect(result.wangsets).toHaveLength(1);
    expect(result.wangsets[0].name).toBe('Ground');
    for (const wt of result.wangsets[0].wangtiles) {
      expect(wt.tileset).toBe(0);
    }
  });

  it('preserves tile probability', () => {
    const result = migrateToProjectMetadata(legacyMetadata);
    const wt = result.wangsets[0].wangtiles.find(w => w.tileid === 15);
    expect(wt!.probability).toBe(0.5);
  });

  it('preserves transformations', () => {
    const result = migrateToProjectMetadata(legacyMetadata);
    expect(result.transformations).toEqual(legacyMetadata.transformations);
  });

  it('preserves animations when present', () => {
    const withAnims: TilesetMetadata = {
      ...legacyMetadata,
      animations: [
        { name: 'water', frameCount: 3, frameDuration: 200, pattern: 'ping-pong', frames: [] },
      ],
    };
    const result = migrateToProjectMetadata(withAnims);
    expect(result.animations).toHaveLength(1);
    expect(result.animations![0].name).toBe('water');
  });

  it('passes through already-migrated ProjectMetadata unchanged', () => {
    const project: ProjectMetadata = {
      version: 2,
      tilesets: [
        { tilesetImage: 'terrain.png', tileWidth: 16, tileHeight: 16, columns: 39, tileCount: 1482 },
      ],
      wangsets: [],
    };
    const result = migrateToProjectMetadata(project);
    expect(result).toBe(project); // Same reference
  });

  it('is idempotent — double migration gives same result', () => {
    const first = migrateToProjectMetadata(legacyMetadata);
    const second = migrateToProjectMetadata(first);
    expect(second).toBe(first); // Same reference since already v2
  });
});
