import * as ex from 'excalibur';
import { TilesetMetadata, AnimationData } from '../core/metadata-schema.js';
import { WangSet } from '../core/wang-set.js';
import { loadMetadata } from '../core/metadata-loader.js';
import { generateAllVariants } from '../core/variant-generator.js';
import { computeColorDistances } from '../core/color-distance.js';

export class TilesetManager {
  spriteSheet!: ex.SpriteSheet;
  wangSets: WangSet[] = [];
  metadata!: TilesetMetadata;

  private imageSource: ex.ImageSource;
  private metadataJson: TilesetMetadata;

  constructor(imageSource: ex.ImageSource, metadataJson: TilesetMetadata) {
    this.imageSource = imageSource;
    this.metadataJson = metadataJson;
  }

  /** Initialize after resources are loaded */
  initialize(): void {
    this.metadata = this.metadataJson;

    // Create SpriteSheet
    const rows = Math.ceil(this.metadata.tileCount / this.metadata.columns);
    this.spriteSheet = ex.SpriteSheet.fromImageSource({
      image: this.imageSource,
      grid: {
        rows,
        columns: this.metadata.columns,
        spriteWidth: this.metadata.tileWidth,
        spriteHeight: this.metadata.tileHeight,
      },
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
  reload(metadata: TilesetMetadata): void {
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

  /** Get the first WangSet (convenience for single-set usage) */
  get primaryWangSet(): WangSet | undefined {
    return this.wangSets[0];
  }

  /** Get animations from metadata */
  get animations(): AnimationData[] {
    return this.metadata?.animations ?? [];
  }
}
