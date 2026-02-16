import { describe, it, expect } from 'vitest';
import { WangId } from '../../src/core/wang-id.js';
import { WangSet } from '../../src/core/wang-set.js';
import { WangColor } from '../../src/core/wang-color.js';
import { computeColorDistances } from '../../src/core/color-distance.js';

function makeColor(id: number, name: string): WangColor {
  return { id, name, color: '#000000', imageTileId: -1, probability: 1.0 };
}

describe('computeColorDistances', () => {
  it('returns 0 for self-distance', () => {
    const ws = new WangSet('test', 'corner', [makeColor(1, 'A'), makeColor(2, 'B')]);
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 1])); // has both A and B
    const { distances: dist } = computeColorDistances(ws);
    expect(dist[1][1]).toBe(0);
    expect(dist[2][2]).toBe(0);
  });

  it('returns 1 for direct transitions', () => {
    const ws = new WangSet('test', 'corner', [makeColor(1, 'A'), makeColor(2, 'B')]);
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 1]));
    const { distances: dist } = computeColorDistances(ws);
    expect(dist[1][2]).toBe(1);
    expect(dist[2][1]).toBe(1);
  });

  it('returns -1 when no path exists', () => {
    const ws = new WangSet('test', 'corner', [
      makeColor(1, 'A'),
      makeColor(2, 'B'),
      makeColor(3, 'C'),
    ]);
    // A-B transition exists but no B-C or A-C
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 1]));
    const { distances: dist } = computeColorDistances(ws);
    expect(dist[1][3]).toBe(-1);
    expect(dist[3][1]).toBe(-1);
  });

  it('finds indirect paths via Floyd-Warshall', () => {
    const ws = new WangSet('test', 'corner', [
      makeColor(1, 'A'),
      makeColor(2, 'B'),
      makeColor(3, 'C'),
    ]);
    // A-B transition
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 1]));
    // B-C transition
    ws.addTileMapping(1, WangId.fromArray([0, 2, 0, 3, 0, 2, 0, 2]));
    const { distances: dist } = computeColorDistances(ws);
    // A->C should be 2 (A->B->C)
    expect(dist[1][3]).toBe(2);
    expect(dist[3][1]).toBe(2);
  });
});

describe('next-hop matrix', () => {
  it('returns direct target for distance-1 pairs', () => {
    const ws = new WangSet('test', 'corner', [makeColor(1, 'A'), makeColor(2, 'B')]);
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 1]));
    const { nextHop } = computeColorDistances(ws);
    expect(nextHop[1][2]).toBe(2); // A->B: go directly to B
    expect(nextHop[2][1]).toBe(1); // B->A: go directly to A
  });

  it('returns self for same color', () => {
    const ws = new WangSet('test', 'corner', [makeColor(1, 'A'), makeColor(2, 'B')]);
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 1]));
    const { nextHop } = computeColorDistances(ws);
    expect(nextHop[1][1]).toBe(1);
    expect(nextHop[2][2]).toBe(2);
  });

  it('returns intermediate for distance-2 paths', () => {
    const ws = new WangSet('test', 'corner', [
      makeColor(1, 'A'),
      makeColor(2, 'B'),
      makeColor(3, 'C'),
    ]);
    // A-B transition
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 1]));
    // B-C transition
    ws.addTileMapping(1, WangId.fromArray([0, 2, 0, 3, 0, 2, 0, 2]));
    const { nextHop } = computeColorDistances(ws);
    // A->C should go through B first
    expect(nextHop[1][3]).toBe(2);
    // C->A should go through B first
    expect(nextHop[3][1]).toBe(2);
  });

  it('returns -1 when no path exists', () => {
    const ws = new WangSet('test', 'corner', [
      makeColor(1, 'A'),
      makeColor(2, 'B'),
      makeColor(3, 'C'),
    ]);
    // Only A-B transition, no path to C
    ws.addTileMapping(0, WangId.fromArray([0, 1, 0, 2, 0, 1, 0, 1]));
    const { nextHop } = computeColorDistances(ws);
    expect(nextHop[1][3]).toBe(-1);
    expect(nextHop[3][1]).toBe(-1);
  });
});
