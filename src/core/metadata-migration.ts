import { TilesetMetadata, ProjectMetadata } from './metadata-schema.js';

/**
 * Detect whether input is already ProjectMetadata (version 2) or legacy TilesetMetadata.
 * If legacy, wraps the single tileset into tilesets[0] and injects tileset: 0 on every wangtile.
 * Idempotent — already-migrated data passes through unchanged.
 */
export function migrateToProjectMetadata(
  input: TilesetMetadata | ProjectMetadata
): ProjectMetadata {
  // Already version 2
  if ('version' in input && input.version === 2) {
    return input as ProjectMetadata;
  }

  const legacy = input as TilesetMetadata;

  const project: ProjectMetadata = {
    version: 2,
    tilesets: [
      {
        tilesetImage: legacy.tilesetImage,
        tileWidth: legacy.tileWidth,
        tileHeight: legacy.tileHeight,
        columns: legacy.columns,
        tileCount: legacy.tileCount,
      },
    ],
    wangsets: legacy.wangsets.map(ws => ({
      ...ws,
      wangtiles: ws.wangtiles.map(wt => ({
        ...wt,
        tileset: wt.tileset ?? 0,
      })),
    })),
  };

  if (legacy.transformations) {
    project.transformations = legacy.transformations;
  }
  if (legacy.animations) {
    project.animations = legacy.animations;
  }

  return project;
}
