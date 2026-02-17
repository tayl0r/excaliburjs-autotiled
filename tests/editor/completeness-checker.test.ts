import { describe, it, expect } from 'vitest';
import { checkCompleteness } from '../../src/editor/completeness-checker.js';
import { WangSetData } from '../../src/core/metadata-schema.js';

function makeWangSet(colorCount: number, wangtiles: { tileid: number; wangid: number[] }[]): WangSetData {
  const colors = Array.from({ length: colorCount }, (_, i) => ({
    name: `Color${i + 1}`,
    color: '#000',
    probability: 1.0,
    tile: i,
  }));
  return { name: 'Test', type: 'corner', tile: 0, colors, wangtiles };
}

describe('checkCompleteness', () => {
  it('returns 0/0 for a WangSet with no colors', () => {
    const ws = makeWangSet(0, []);
    const result = checkCompleteness(ws);
    expect(result.total).toBe(0);
    expect(result.matched).toBe(0);
    expect(result.missing).toEqual([]);
  });

  it('returns 1/1 for 1 color with a full tile', () => {
    const ws = makeWangSet(1, [
      { tileid: 0, wangid: [0, 1, 0, 1, 0, 1, 0, 1] },
    ]);
    const result = checkCompleteness(ws);
    expect(result.total).toBe(1);   // 1^4
    expect(result.matched).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it('returns 16/16 for complete 2-color corner set', () => {
    const tiles = [];
    let id = 0;
    for (let tl = 1; tl <= 2; tl++) {
      for (let tr = 1; tr <= 2; tr++) {
        for (let br = 1; br <= 2; br++) {
          for (let bl = 1; bl <= 2; bl++) {
            tiles.push({ tileid: id++, wangid: [0, tr, 0, br, 0, bl, 0, tl] });
          }
        }
      }
    }
    const ws = makeWangSet(2, tiles);
    const result = checkCompleteness(ws);
    expect(result.total).toBe(16);
    expect(result.matched).toBe(16);
    expect(result.missing).toEqual([]);
  });

  it('detects missing combinations', () => {
    const tiles = [];
    let id = 0;
    for (let tl = 1; tl <= 2; tl++) {
      for (let tr = 1; tr <= 2; tr++) {
        for (let br = 1; br <= 2; br++) {
          for (let bl = 1; bl <= 2; bl++) {
            if (tl === 2 && tr === 2 && br === 2 && bl === 2) continue;
            if (tl === 2 && tr === 1 && br === 2 && bl === 1) continue;
            tiles.push({ tileid: id++, wangid: [0, tr, 0, br, 0, bl, 0, tl] });
          }
        }
      }
    }
    const ws = makeWangSet(2, tiles);
    const result = checkCompleteness(ws);
    expect(result.total).toBe(16);
    expect(result.matched).toBe(14);
    expect(result.missing).toHaveLength(2);
  });
});
