import { describe, it, expect } from 'vitest';
import { templateSlotWangId, TEMPLATE_SLOTS } from '../../src/editor/template-utils.js';

describe('TEMPLATE_SLOTS', () => {
  it('has 16 entries', () => {
    expect(TEMPLATE_SLOTS).toHaveLength(16);
  });

  it('slot 0 is all-A (TL=A,TR=A,BR=A,BL=A)', () => {
    expect(TEMPLATE_SLOTS[0]).toEqual({ tl: 'A', tr: 'A', br: 'A', bl: 'A' });
  });

  it('slot 15 is all-B', () => {
    expect(TEMPLATE_SLOTS[15]).toEqual({ tl: 'B', tr: 'B', br: 'B', bl: 'B' });
  });

  it('slot 5 is TL=B,TR=A,BR=B,BL=A (binary 0101)', () => {
    expect(TEMPLATE_SLOTS[5]).toEqual({ tl: 'B', tr: 'A', br: 'B', bl: 'A' });
  });
});

describe('templateSlotWangId', () => {
  it('generates correct WangId for slot 0 with colorA=1, colorB=2', () => {
    const wangid = templateSlotWangId(0, 1, 2);
    // All corners = A (1), edges = 0
    expect(wangid).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
  });

  it('generates correct WangId for slot 15 with colorA=1, colorB=2', () => {
    const wangid = templateSlotWangId(15, 1, 2);
    expect(wangid).toEqual([0, 2, 0, 2, 0, 2, 0, 2]);
  });

  it('generates correct WangId for slot 3 (TL=B,TR=B,BR=A,BL=A) binary 1100', () => {
    const wangid = templateSlotWangId(3, 1, 2);
    // TL=B(2), TR=B(2), BR=A(1), BL=A(1)
    // wangid indices: 7=TL, 1=TR, 3=BR, 5=BL
    expect(wangid).toEqual([0, 2, 0, 1, 0, 1, 0, 2]);
  });

  it('works with arbitrary color IDs', () => {
    const wangid = templateSlotWangId(15, 3, 7);
    expect(wangid).toEqual([0, 7, 0, 7, 0, 7, 0, 7]);
  });
});
