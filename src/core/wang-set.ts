import { WangId } from './wang-id.js';
import { WangColor } from './wang-color.js';
import { Cell, createCell } from './cell.js';

export type WangSetType = 'corner' | 'edge' | 'mixed';

/** A variant is a (WangId, Cell) pair — possibly transformed from a base tile */
export interface WangVariant {
  wangId: WangId;
  cell: Cell;
}

export class WangSet {
  name: string;
  type: WangSetType;
  colors: WangColor[];
  /** tileId -> WangId mapping (base tiles only, no transforms) */
  private tileMapping: Map<number, WangId> = new Map();
  /** Pre-computed variants (base + transforms). Call recomputeVariants() after changing tiles. */
  private variants: WangVariant[] = [];
  /** Color distance matrix [colorA][colorB]. -1 = no path. */
  private distanceMatrix: number[][] = [];
  /** Next-hop matrix [from][to] = first intermediate color on shortest path */
  private nextHopMatrix: number[][] = [];
  /** Cached max finite distance in the distance matrix */
  private cachedMaxDistance = -1;
  /** Representative tile for UI */
  imageTileId: number;

  constructor(name: string, type: WangSetType, colors: WangColor[] = [], imageTileId = -1) {
    this.name = name;
    this.type = type;
    this.colors = colors;
    this.imageTileId = imageTileId;
  }

  /** Get WangId for a tile. Returns undefined if tile isn't in this set. */
  wangIdOf(tileId: number): WangId | undefined {
    return this.tileMapping.get(tileId);
  }

  /** Add or update a tile -> WangId mapping */
  addTileMapping(tileId: number, wangId: WangId): void {
    this.tileMapping.set(tileId, wangId);
  }

  /** Remove a tile mapping */
  removeTileMapping(tileId: number): void {
    this.tileMapping.delete(tileId);
  }

  /** Get all base tile mappings */
  getTileMappings(): Map<number, WangId> {
    return new Map(this.tileMapping);
  }

  /** Get the number of base tile mappings */
  get tileCount(): number {
    return this.tileMapping.size;
  }

  /** Get all pre-computed variants (call recomputeVariants first) */
  allVariants(): WangVariant[] {
    return this.variants;
  }

  /** Set the variants (called by variant-generator) */
  setVariants(variants: WangVariant[]): void {
    this.variants = variants;
  }

  /** Get color distance between two colors. -1 = no path. */
  colorDistance(colorA: number, colorB: number): number {
    if (colorA === colorB) return 0;
    if (colorA <= 0 || colorB <= 0) return 0;
    if (colorA >= this.distanceMatrix.length || colorB >= this.distanceMatrix.length) return -1;
    return this.distanceMatrix[colorA][colorB];
  }

  /** Set the distance matrix (called by color-distance) */
  setDistanceMatrix(matrix: number[][]): void {
    this.distanceMatrix = matrix;
    this.cachedMaxDistance = -1; // invalidate cache
  }

  /** Set the next-hop matrix (called by color-distance) */
  setNextHopMatrix(matrix: number[][]): void {
    this.nextHopMatrix = matrix;
  }

  /** Get the first intermediate color on the shortest path from `from` to `to`.
   *  Returns `to` if distance <= 1 (direct connection or same color). */
  nextHopColor(from: number, to: number): number {
    if (from === to) return from;
    if (from <= 0 || to <= 0) return to;
    if (from >= this.nextHopMatrix.length || to >= this.nextHopMatrix.length) return to;
    const hop = this.nextHopMatrix[from][to];
    return hop < 0 ? to : hop;
  }

  /** Max finite distance in the distance matrix */
  get maxColorDistance(): number {
    if (this.cachedMaxDistance >= 0) return this.cachedMaxDistance;
    let max = 0;
    for (let i = 1; i < this.distanceMatrix.length; i++) {
      for (let j = 1; j < this.distanceMatrix.length; j++) {
        if (this.distanceMatrix[i][j] > max) {
          max = this.distanceMatrix[i][j];
        }
      }
    }
    this.cachedMaxDistance = max;
    return max;
  }

  /** Get the probability product for a WangId based on its colors */
  wangIdProbability(wangId: WangId): number {
    let prob = 1.0;
    for (let i = 0; i < 8; i++) {
      const colorIdx = wangId.indexColor(i);
      if (colorIdx > 0 && colorIdx <= this.colors.length) {
        prob *= this.colors[colorIdx - 1].probability;
      }
    }
    return prob;
  }

  /** Get a color by its 1-based ID */
  getColor(colorId: number): WangColor | undefined {
    if (colorId < 1 || colorId > this.colors.length) return undefined;
    return this.colors[colorId - 1];
  }
}
