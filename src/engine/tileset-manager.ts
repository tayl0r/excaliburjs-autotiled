import * as ex from 'excalibur';
import type { ProjectMetadata, TilesetDef } from '../core/metadata-schema.js';
import type { WangSet } from '../core/wang-set.js';
import { loadMetadata } from '../core/metadata-loader.js';
import { generateAllVariants } from '../core/variant-generator.js';
import { computeColorDistances } from '../core/color-distance.js';
import type { TilesetSheet } from './sprite-resolver.js';

export class TilesetManager {
  spriteSheets: TilesetSheet[] = [];
  wangSets: WangSet[] = [];
  metadata: ProjectMetadata;

  private imageSources: ex.ImageSource[];

  constructor(imageSources: ex.ImageSource[], metadata: ProjectMetadata) {
    this.imageSources = imageSources;
    this.metadata = metadata;
  }

  /** The primary tileset definition (tilesets[0]) */
  get primaryTileset(): TilesetDef {
    return this.metadata.tilesets[0];
  }

  /** Initialize sprite sheets after image resources are loaded */
  initialize(): void {
    this.spriteSheets = this.metadata.tilesets.map((ts, i) => {
      const rows = Math.ceil(ts.tileCount / ts.columns);
      const sheet = ex.SpriteSheet.fromImageSource({
        image: this.imageSources[i],
        grid: {
          rows,
          columns: ts.columns,
          spriteWidth: ts.tileWidth,
          spriteHeight: ts.tileHeight,
        },
      });
      return { sheet, columns: ts.columns };
    });

    this.buildWangSets();
  }

  /** Reload WangSets from updated metadata */
  reload(metadata: ProjectMetadata): void {
    this.metadata = metadata;
    this.buildWangSets();
  }

  /** Load WangSets from metadata and pre-compute variants and distance matrices */
  private buildWangSets(): void {
    const { wangSets, transformations } = loadMetadata(this.metadata);
    this.wangSets = wangSets;

    for (const ws of this.wangSets) {
      ws.setVariants(generateAllVariants(ws, transformations));

      const { distances, nextHop } = computeColorDistances(ws);
      ws.setDistanceMatrix(distances);
      ws.setNextHopMatrix(nextHop);
    }
  }

  /** Get the HTMLImageElement for a tileset by index */
  getImage(tilesetIndex: number): HTMLImageElement | undefined {
    return this.imageSources[tilesetIndex]?.image;
  }

  /** Get the first WangSet (convenience for single-set usage) */
  get primaryWangSet(): WangSet | undefined {
    return this.wangSets[0];
  }
}
