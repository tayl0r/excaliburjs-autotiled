import { describe, it, expect } from 'vitest';
import { WangId, WangIndex, isActiveIndex, activeIndices, WANG_INDEX_COUNT } from '../../src/core/wang-id.js';

describe('WangId', () => {
  describe('constructor', () => {
    it('creates all-zero WangId by default', () => {
      const w = new WangId();
      for (let i = 0; i < 8; i++) {
        expect(w.indexColor(i)).toBe(0);
      }
    });

    it('creates WangId from array', () => {
      const w = new WangId([0, 1, 0, 2, 0, 1, 0, 2]);
      expect(w.indexColor(1)).toBe(1);
      expect(w.indexColor(3)).toBe(2);
      expect(w.indexColor(5)).toBe(1);
      expect(w.indexColor(7)).toBe(2);
    });

    it('throws on wrong length', () => {
      expect(() => new WangId([1, 2, 3])).toThrow();
    });
  });

  describe('fromArray / toArray round-trip', () => {
    it('preserves all values', () => {
      const arr = [0, 1, 0, 2, 0, 1, 0, 2];
      const w = WangId.fromArray(arr);
      expect(w.toArray()).toEqual(arr);
    });

    it('handles all-same values', () => {
      const arr = [3, 3, 3, 3, 3, 3, 3, 3];
      expect(WangId.fromArray(arr).toArray()).toEqual(arr);
    });
  });

  describe('withIndexColor', () => {
    it('returns new WangId with updated index', () => {
      const w = new WangId();
      const w2 = w.withIndexColor(WangIndex.TopRight, 1);
      expect(w.indexColor(WangIndex.TopRight)).toBe(0); // original unchanged
      expect(w2.indexColor(WangIndex.TopRight)).toBe(1);
    });
  });

  describe('oppositeIndex', () => {
    it('Top <-> Bottom', () => {
      expect(WangId.oppositeIndex(WangIndex.Top)).toBe(WangIndex.Bottom);
      expect(WangId.oppositeIndex(WangIndex.Bottom)).toBe(WangIndex.Top);
    });

    it('TopRight <-> BottomLeft', () => {
      expect(WangId.oppositeIndex(WangIndex.TopRight)).toBe(WangIndex.BottomLeft);
      expect(WangId.oppositeIndex(WangIndex.BottomLeft)).toBe(WangIndex.TopRight);
    });

    it('Right <-> Left', () => {
      expect(WangId.oppositeIndex(WangIndex.Right)).toBe(WangIndex.Left);
      expect(WangId.oppositeIndex(WangIndex.Left)).toBe(WangIndex.Right);
    });

    it('BottomRight <-> TopLeft', () => {
      expect(WangId.oppositeIndex(WangIndex.BottomRight)).toBe(WangIndex.TopLeft);
      expect(WangId.oppositeIndex(WangIndex.TopLeft)).toBe(WangIndex.BottomRight);
    });

    it('double opposite returns original', () => {
      for (let i = 0; i < 8; i++) {
        expect(WangId.oppositeIndex(WangId.oppositeIndex(i))).toBe(i);
      }
    });
  });

  describe('rotation', () => {
    it('rotated(0) returns copy', () => {
      const w = WangId.fromArray([0, 1, 0, 2, 0, 3, 0, 4]);
      expect(w.rotated(0).toArray()).toEqual(w.toArray());
    });

    it('rotated(1) shifts indices by +2 (90 CW)', () => {
      // Before: [Top=0, TR=1, Right=0, BR=2, Bottom=0, BL=3, Left=0, TL=4]
      // After 90 CW: Top->Right, TR->BR, Right->Bottom, BR->BL, Bottom->Left, BL->TL, Left->Top, TL->TR
      // So new array: [Left=0, TL=4, Top=0, TR=1, Right=0, BR=2, Bottom=0, BL=3]
      const w = WangId.fromArray([0, 1, 0, 2, 0, 3, 0, 4]);
      const r = w.rotated(1);
      expect(r.toArray()).toEqual([0, 4, 0, 1, 0, 2, 0, 3]);
    });

    it('rotated(2) is 180 degrees', () => {
      const w = WangId.fromArray([0, 1, 0, 2, 0, 3, 0, 4]);
      const r = w.rotated(2);
      expect(r.toArray()).toEqual([0, 3, 0, 4, 0, 1, 0, 2]);
    });

    it('rotated(4) is identity', () => {
      const w = WangId.fromArray([0, 1, 0, 2, 0, 3, 0, 4]);
      expect(w.rotated(4).toArray()).toEqual(w.toArray());
    });

    it('4 rotations return to original', () => {
      const w = WangId.fromArray([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(w.rotated(1).rotated(1).rotated(1).rotated(1).toArray()).toEqual(w.toArray());
    });
  });

  describe('flippedHorizontally', () => {
    it('swaps left and right', () => {
      // Swap map: {0:0, 1:7, 2:6, 3:5, 4:4, 5:3, 6:2, 7:1}
      const w = WangId.fromArray([1, 2, 3, 4, 5, 6, 7, 8]);
      const f = w.flippedHorizontally();
      expect(f.toArray()).toEqual([1, 8, 7, 6, 5, 4, 3, 2]);
    });

    it('double flip H is identity', () => {
      const w = WangId.fromArray([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(w.flippedHorizontally().flippedHorizontally().toArray()).toEqual(w.toArray());
    });
  });

  describe('flippedVertically', () => {
    it('swaps top and bottom', () => {
      // Swap map: {0:4, 1:3, 2:2, 3:1, 4:0, 5:7, 6:6, 7:5}
      const w = WangId.fromArray([1, 2, 3, 4, 5, 6, 7, 8]);
      const f = w.flippedVertically();
      expect(f.toArray()).toEqual([5, 4, 3, 2, 1, 8, 7, 6]);
    });

    it('double flip V is identity', () => {
      const w = WangId.fromArray([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(w.flippedVertically().flippedVertically().toArray()).toEqual(w.toArray());
    });
  });

  describe('matches', () => {
    it('identical WangIds match', () => {
      const a = WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 2]);
      const b = WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 2]);
      expect(a.matches(b, 'corner')).toBe(true);
    });

    it('wildcard (0) matches anything', () => {
      const a = WangId.fromArray([0, 1, 0, 0, 0, 1, 0, 2]);
      const b = WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 2]);
      expect(a.matches(b, 'corner')).toBe(true);
    });

    it('mismatched corners fail', () => {
      const a = WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 2]);
      const b = WangId.fromArray([0, 2, 0, 2, 0, 1, 0, 2]);
      expect(a.matches(b, 'corner')).toBe(false);
    });

    it('corner type ignores edge indices', () => {
      const a = WangId.fromArray([1, 1, 0, 2, 0, 1, 0, 2]);
      const b = WangId.fromArray([3, 1, 0, 2, 0, 1, 0, 2]);
      expect(a.matches(b, 'corner')).toBe(true);
    });

    it('edge type ignores corner indices', () => {
      const a = WangId.fromArray([1, 9, 2, 9, 3, 9, 4, 9]);
      const b = WangId.fromArray([1, 5, 2, 5, 3, 5, 4, 5]);
      expect(a.matches(b, 'edge')).toBe(true);
    });

    it('mixed type checks all indices', () => {
      const a = WangId.fromArray([1, 1, 2, 2, 3, 3, 4, 4]);
      const b = WangId.fromArray([1, 1, 2, 2, 3, 3, 4, 5]);
      expect(a.matches(b, 'mixed')).toBe(false);
    });
  });

  describe('hasWildcards', () => {
    it('returns true when active indices have zeros', () => {
      const w = WangId.fromArray([0, 1, 0, 0, 0, 1, 0, 1]);
      expect(w.hasWildcards('corner')).toBe(true);
    });

    it('returns false when all active indices are non-zero', () => {
      const w = WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 2]);
      expect(w.hasWildcards('corner')).toBe(false);
    });
  });

  describe('equals', () => {
    it('equal WangIds', () => {
      const a = WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 2]);
      const b = WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 2]);
      expect(a.equals(b)).toBe(true);
    });

    it('different WangIds', () => {
      const a = WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 2]);
      const b = WangId.fromArray([0, 2, 0, 1, 0, 2, 0, 1]);
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('factory methods', () => {
    it('allCorners sets only corners', () => {
      const w = WangId.allCorners(1);
      expect(w.toArray()).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    });

    it('allEdges sets only edges', () => {
      const w = WangId.allEdges(2);
      expect(w.toArray()).toEqual([2, 0, 2, 0, 2, 0, 2, 0]);
    });

    it('all sets everything', () => {
      const w = WangId.all(3);
      expect(w.toArray()).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
    });
  });

  describe('toKey', () => {
    it('generates consistent keys', () => {
      const a = WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 2]);
      const b = WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 2]);
      expect(a.toKey()).toBe(b.toKey());
    });

    it('different WangIds have different keys', () => {
      const a = WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 2]);
      const b = WangId.fromArray([0, 2, 0, 1, 0, 2, 0, 1]);
      expect(a.toKey()).not.toBe(b.toKey());
    });
  });
});

describe('isActiveIndex', () => {
  it('corner type: only odd indices active', () => {
    expect(isActiveIndex(0, 'corner')).toBe(false);
    expect(isActiveIndex(1, 'corner')).toBe(true);
    expect(isActiveIndex(2, 'corner')).toBe(false);
    expect(isActiveIndex(3, 'corner')).toBe(true);
  });

  it('edge type: only even indices active', () => {
    expect(isActiveIndex(0, 'edge')).toBe(true);
    expect(isActiveIndex(1, 'edge')).toBe(false);
    expect(isActiveIndex(2, 'edge')).toBe(true);
    expect(isActiveIndex(3, 'edge')).toBe(false);
  });

  it('mixed type: all indices active', () => {
    for (let i = 0; i < 8; i++) {
      expect(isActiveIndex(i, 'mixed')).toBe(true);
    }
  });
});

describe('activeIndices', () => {
  it('corner returns [1,3,5,7]', () => {
    expect(activeIndices('corner')).toEqual([1, 3, 5, 7]);
  });

  it('edge returns [0,2,4,6]', () => {
    expect(activeIndices('edge')).toEqual([0, 2, 4, 6]);
  });

  it('mixed returns all 8', () => {
    expect(activeIndices('mixed')).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
