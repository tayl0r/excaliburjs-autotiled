export interface WangColor {
  /** 1-based index (0 = wildcard, not stored as a color) */
  id: number;
  name: string;
  /** Hex color for editor overlay display — auto-assigned from WANG_COLOR_PALETTE */
  color: string;
  /** Representative tile ID for UI thumbnails (-1 = none) */
  imageTileId: number;
  /** Tileset index for the representative tile */
  tilesetIndex: number;
  /** Weight for random selection (default 1.0) */
  probability: number;
}

/** 254 static colors for WangColor display, indexed by (colorId - 1) % length */
export const WANG_COLOR_PALETTE: string[] = (() => {
  // First 8 hand-picked for common terrain types
  const handPicked = [
    '#4caf50', // green
    '#b5651d', // brown
    '#2196f3', // blue
    '#ff9800', // orange
    '#9c27b0', // purple
    '#f44336', // red
    '#00bcd4', // cyan
    '#ffeb3b', // yellow
  ];

  // Generate remaining 246 via golden-angle hue rotation
  const generated: string[] = [];
  for (let i = 0; i < 246; i++) {
    const hue = (i * 137.508) % 360;
    const sat = 60 + (i % 4) * 10;   // 60, 70, 80, 90
    const lit = 40 + (i % 3) * 10;   // 40, 50, 60
    generated.push(hslToHex(hue, sat, lit));
  }

  return [...handPicked, ...generated];
})();

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = lN - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Get the display color for a 1-based WangColor id */
export function wangColorHex(colorId: number): string {
  if (colorId <= 0) return '#333';
  return WANG_COLOR_PALETTE[(colorId - 1) % WANG_COLOR_PALETTE.length];
}
