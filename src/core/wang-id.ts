export const WANG_INDEX_COUNT = 8;

// Index names for readability
export const WangIndex = {
  Top: 0,
  TopRight: 1,
  Right: 2,
  BottomRight: 3,
  Bottom: 4,
  BottomLeft: 5,
  Left: 6,
  TopLeft: 7,
} as const;

// Neighbor offsets: [dx, dy] for each wang index
export const NEIGHBOR_OFFSETS: ReadonlyArray<[dx: number, dy: number]> = [
  [0, -1],  // 0: Top
  [1, -1],  // 1: TopRight
  [1, 0],   // 2: Right
  [1, 1],   // 3: BottomRight
  [0, 1],   // 4: Bottom
  [-1, 1],  // 5: BottomLeft
  [-1, 0],  // 6: Left
  [-1, -1], // 7: TopLeft
];

export class WangId {
  readonly colors: number[];

  constructor(colors?: number[]) {
    this.colors = colors ? [...colors] : [0, 0, 0, 0, 0, 0, 0, 0];
    if (this.colors.length !== WANG_INDEX_COUNT) {
      throw new Error(`WangId requires exactly ${WANG_INDEX_COUNT} colors, got ${this.colors.length}`);
    }
  }

  /** Get color at index 0-7 */
  indexColor(index: number): number {
    return this.colors[index];
  }

  /** Return new WangId with color set at index */
  withIndexColor(index: number, color: number): WangId {
    const newColors = [...this.colors];
    newColors[index] = color;
    return new WangId(newColors);
  }

  /** Get the index on the opposite side (for neighbor matching). opposite(0)=4, opposite(1)=5, etc. */
  static oppositeIndex(index: number): number {
    return (index + 4) % WANG_INDEX_COUNT;
  }

  /** Rotate CW by n*90 degrees. Each 90 CW shifts indices by +2. */
  rotated(n: number): WangId {
    const r = ((n % 4) + 4) % 4;
    if (r === 0) return new WangId(this.colors);
    const newColors = new Array(WANG_INDEX_COUNT);
    for (let i = 0; i < WANG_INDEX_COUNT; i++) {
      const newIndex = (i + r * 2) % WANG_INDEX_COUNT;
      newColors[newIndex] = this.colors[i];
    }
    return new WangId(newColors);
  }

  /** Flip horizontally (left-right). Swap map: {0:0, 1:7, 2:6, 3:5, 4:4, 5:3, 6:2, 7:1} */
  flippedHorizontally(): WangId {
    const c = this.colors;
    return new WangId([c[0], c[7], c[6], c[5], c[4], c[3], c[2], c[1]]);
  }

  /** Flip vertically (top-bottom). Swap map: {0:4, 1:3, 2:2, 3:1, 4:0, 5:7, 6:6, 7:5} */
  flippedVertically(): WangId {
    const c = this.colors;
    return new WangId([c[4], c[3], c[2], c[1], c[0], c[7], c[6], c[5]]);
  }

  /** Check if this WangId matches another, considering only indices where BOTH have non-zero values */
  matches(other: WangId, type: 'corner' | 'edge' | 'mixed'): boolean {
    for (let i = 0; i < WANG_INDEX_COUNT; i++) {
      if (!isActiveIndex(i, type)) continue;
      const a = this.colors[i];
      const b = other.colors[i];
      if (a === 0 || b === 0) continue; // wildcard
      if (a !== b) return false;
    }
    return true;
  }

  /** Check if any color is 0 (wildcard) in active indices */
  hasWildcards(type: 'corner' | 'edge' | 'mixed'): boolean {
    for (let i = 0; i < WANG_INDEX_COUNT; i++) {
      if (!isActiveIndex(i, type)) continue;
      if (this.colors[i] === 0) return true;
    }
    return false;
  }

  /** Serialize to array */
  toArray(): number[] {
    return [...this.colors];
  }

  /** Deserialize from array */
  static fromArray(arr: number[]): WangId {
    return new WangId(arr);
  }

  /** Check equality */
  equals(other: WangId): boolean {
    for (let i = 0; i < WANG_INDEX_COUNT; i++) {
      if (this.colors[i] !== other.colors[i]) return false;
    }
    return true;
  }

  /** Create a string key for hashing/dedup */
  toKey(): string {
    return this.colors.join(',');
  }

  static allCorners(color: number): WangId {
    return new WangId([0, color, 0, color, 0, color, 0, color]);
  }

  static allEdges(color: number): WangId {
    return new WangId([color, 0, color, 0, color, 0, color, 0]);
  }

  static all(color: number): WangId {
    return new WangId(new Array<number>(WANG_INDEX_COUNT).fill(color));
  }
}

/** Check if an index is active for the given WangSet type */
export function isActiveIndex(index: number, type: 'corner' | 'edge' | 'mixed'): boolean {
  const isCorner = index % 2 === 1; // 1, 3, 5, 7 are corners
  if (type === 'corner') return isCorner;
  if (type === 'edge') return !isCorner;
  return true; // mixed
}

/** Get the mask of active indices for a type (returns which indices to check) */
export function activeIndices(type: 'corner' | 'edge' | 'mixed'): number[] {
  if (type === 'corner') return [1, 3, 5, 7];
  if (type === 'edge') return [0, 2, 4, 6];
  return [0, 1, 2, 3, 4, 5, 6, 7];
}
