import { describe, it, expect } from 'vitest';
import { resizeColorArray, type ResizeParams, shiftPlacedPrefab } from '../../src/core/map-resize.js';
import type { PlacedPrefab } from '../../src/core/map-schema.js';

describe('resizeColorArray', () => {
  // Helper: create a 4x4 grid with sequential values 1..16
  function make4x4(): number[] {
    return Array.from({ length: 16 }, (_, i) => i + 1);
  }

  it('expands south (adds rows at bottom)', () => {
    const old = make4x4();
    const params: ResizeParams = {
      oldWidth: 4, oldHeight: 4,
      newWidth: 4, newHeight: 6,
      offsetX: 0, offsetY: 0,
    };
    const result = resizeColorArray(old, params, 99);
    expect(result.length).toBe(24);
    // Original data preserved at top
    expect(result.slice(0, 16)).toEqual(old);
    // New rows filled
    expect(result.slice(16)).toEqual([99, 99, 99, 99, 99, 99, 99, 99]);
  });

  it('expands north (adds rows at top)', () => {
    const old = make4x4();
    const params: ResizeParams = {
      oldWidth: 4, oldHeight: 4,
      newWidth: 4, newHeight: 6,
      offsetX: 0, offsetY: 2,
    };
    const result = resizeColorArray(old, params, 99);
    expect(result.length).toBe(24);
    // First 2 rows are fill
    expect(result.slice(0, 8)).toEqual([99, 99, 99, 99, 99, 99, 99, 99]);
    // Original data shifted down
    expect(result.slice(8)).toEqual(old);
  });

  it('expands east (adds cols at right)', () => {
    const old = make4x4();
    const params: ResizeParams = {
      oldWidth: 4, oldHeight: 4,
      newWidth: 6, newHeight: 4,
      offsetX: 0, offsetY: 0,
    };
    const result = resizeColorArray(old, params, 0);
    expect(result.length).toBe(24);
    // Row 0: 1,2,3,4,0,0
    expect(result.slice(0, 6)).toEqual([1, 2, 3, 4, 0, 0]);
    // Row 1: 5,6,7,8,0,0
    expect(result.slice(6, 12)).toEqual([5, 6, 7, 8, 0, 0]);
  });

  it('expands west (adds cols at left)', () => {
    const old = make4x4();
    const params: ResizeParams = {
      oldWidth: 4, oldHeight: 4,
      newWidth: 6, newHeight: 4,
      offsetX: 2, offsetY: 0,
    };
    const result = resizeColorArray(old, params, 0);
    expect(result.length).toBe(24);
    // Row 0: 0,0,1,2,3,4
    expect(result.slice(0, 6)).toEqual([0, 0, 1, 2, 3, 4]);
    // Row 3: 0,0,13,14,15,16
    expect(result.slice(18, 24)).toEqual([0, 0, 13, 14, 15, 16]);
  });

  it('shrinks south (removes rows from bottom)', () => {
    const old = make4x4();
    const params: ResizeParams = {
      oldWidth: 4, oldHeight: 4,
      newWidth: 4, newHeight: 2,
      offsetX: 0, offsetY: 0,
    };
    const result = resizeColorArray(old, params, 99);
    expect(result.length).toBe(8);
    // Only first 2 rows kept
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('shrinks north (removes rows from top)', () => {
    const old = make4x4();
    const params: ResizeParams = {
      oldWidth: 4, oldHeight: 4,
      newWidth: 4, newHeight: 2,
      offsetX: 0, offsetY: -2,
    };
    const result = resizeColorArray(old, params, 99);
    expect(result.length).toBe(8);
    // Top 2 rows discarded, bottom 2 remain
    expect(result).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('shrinks east (removes cols from right)', () => {
    const old = make4x4();
    const params: ResizeParams = {
      oldWidth: 4, oldHeight: 4,
      newWidth: 2, newHeight: 4,
      offsetX: 0, offsetY: 0,
    };
    const result = resizeColorArray(old, params, 99);
    expect(result.length).toBe(8);
    // Only first 2 cols of each row
    expect(result).toEqual([1, 2, 5, 6, 9, 10, 13, 14]);
  });

  it('shrinks west (removes cols from left)', () => {
    const old = make4x4();
    const params: ResizeParams = {
      oldWidth: 4, oldHeight: 4,
      newWidth: 2, newHeight: 4,
      offsetX: -2, offsetY: 0,
    };
    const result = resizeColorArray(old, params, 99);
    expect(result.length).toBe(8);
    // Only last 2 cols of each row
    expect(result).toEqual([3, 4, 7, 8, 11, 12, 15, 16]);
  });

  it('uses fillColor for empty areas', () => {
    const old = [1, 2, 3, 4];
    const params: ResizeParams = {
      oldWidth: 2, oldHeight: 2,
      newWidth: 4, newHeight: 4,
      offsetX: 1, offsetY: 1,
    };
    const result = resizeColorArray(old, params, 42);
    expect(result.length).toBe(16);
    // Row 0: all fill
    expect(result.slice(0, 4)).toEqual([42, 42, 42, 42]);
    // Row 1: fill, 1, 2, fill
    expect(result.slice(4, 8)).toEqual([42, 1, 2, 42]);
    // Row 2: fill, 3, 4, fill
    expect(result.slice(8, 12)).toEqual([42, 3, 4, 42]);
    // Row 3: all fill
    expect(result.slice(12, 16)).toEqual([42, 42, 42, 42]);
  });

  it('handles identity resize (no change)', () => {
    const old = [1, 2, 3, 4];
    const params: ResizeParams = {
      oldWidth: 2, oldHeight: 2,
      newWidth: 2, newHeight: 2,
      offsetX: 0, offsetY: 0,
    };
    const result = resizeColorArray(old, params, 0);
    expect(result).toEqual(old);
  });
});

describe('shiftPlacedPrefab', () => {
  it('shifts coordinates by dx, dy', () => {
    const prefab: PlacedPrefab = { prefabName: 'tree', x: 5, y: 10, layer: 2 };
    const shifted = shiftPlacedPrefab(prefab, 3, -2);
    expect(shifted).toEqual({ prefabName: 'tree', x: 8, y: 8, layer: 2 });
  });

  it('preserves all other fields', () => {
    const prefab: PlacedPrefab = { prefabName: 'house', x: 0, y: 0, layer: 3 };
    const shifted = shiftPlacedPrefab(prefab, 10, 10);
    expect(shifted.prefabName).toBe('house');
    expect(shifted.layer).toBe(3);
  });

  it('does not mutate the original', () => {
    const prefab: PlacedPrefab = { prefabName: 'rock', x: 5, y: 5, layer: 0 };
    shiftPlacedPrefab(prefab, 1, 1);
    expect(prefab.x).toBe(5);
    expect(prefab.y).toBe(5);
  });
});
