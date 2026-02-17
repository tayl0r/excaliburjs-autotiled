export interface TemplateSlot {
  tl: 'A' | 'B';
  tr: 'A' | 'B';
  br: 'A' | 'B';
  bl: 'A' | 'B';
}

/**
 * 16 template slots in binary counting order:
 * TL=bit0, TR=bit1, BR=bit2, BL=bit3
 */
export const TEMPLATE_SLOTS: TemplateSlot[] = Array.from({ length: 16 }, (_, i) => ({
  tl: (i & 1) ? 'B' : 'A',
  tr: (i & 2) ? 'B' : 'A',
  br: (i & 4) ? 'B' : 'A',
  bl: (i & 8) ? 'B' : 'A',
}));

/**
 * Build a corner-type WangId array for a template slot.
 * Edges (indices 0,2,4,6) are 0. Corners use colorA or colorB.
 */
export function templateSlotWangId(slotIndex: number, colorA: number, colorB: number): number[] {
  const slot = TEMPLATE_SLOTS[slotIndex];
  const resolve = (v: 'A' | 'B') => v === 'A' ? colorA : colorB;
  // WangId layout: [Top, TR, Right, BR, Bottom, BL, Left, TL]
  return [0, resolve(slot.tr), 0, resolve(slot.br), 0, resolve(slot.bl), 0, resolve(slot.tl)];
}
