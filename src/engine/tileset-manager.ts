import * as ex from 'excalibur';
import { ProjectMetadata, TilesetDef, AnimationData } from '../core/metadata-schema.js';
import { WangSet } from '../core/wang-set.js';
import { loadMetadata } from '../core/metadata-loader.js';
import { generateAllVariants } from '../core/variant-generator.js';
import { computeColorDistances } from '../core/color-distance.js';
import { TilesetSheet } from './sprite-resolver.js';

export class TilesetManager {
  spriteSheets: TilesetSheet[] = [];
  wangSets: WangSet[] = [];
  metadata!: ProjectMetadata;

  private imageSources: ex.ImageSource[];
  private metadataJson: ProjectMetadata;

  constructor(imageSources: ex.ImageSource[], metadataJson: ProjectMetadata) {
    this.imageSources = imageSources;
    this.metadataJson = metadataJson;
  }

  /** The primary tileset definition (tilesets[0]) */
  get primaryTileset(): TilesetDef {
    return this.metadata.tilesets[0];
  }

  /** Initialize after resources are loaded */
  initialize(): void {
    this.metadata = this.metadataJson;

    // Create one SpriteSheet per tileset
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

    // Load WangSets from metadata
    const { wangSets, transformations } = loadMetadata(this.metadataJson);
    this.wangSets = wangSets;

    // Pre-compute variants and distance matrices
    for (const ws of this.wangSets) {
      const variants = generateAllVariants(ws, transformations);
      ws.setVariants(variants);

      const { distances, nextHop } = computeColorDistances(ws);
      ws.setDistanceMatrix(distances);
      ws.setNextHopMatrix(nextHop);
    }
  }

  /** Reload WangSets from updated metadata */
  reload(metadata: ProjectMetadata): void {
    this.metadataJson = metadata;
    this.metadata = metadata;

    const { wangSets, transformations } = loadMetadata(metadata);
    this.wangSets = wangSets;

    for (const ws of this.wangSets) {
      const variants = generateAllVariants(ws, transformations);
      ws.setVariants(variants);

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

  /** Get animations from metadata */
  get animations(): AnimationData[] {
    return this.metadata?.animations ?? [];
  }
}
