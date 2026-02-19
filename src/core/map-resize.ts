import type { PlacedPrefab } from './map-schema.js';

export interface ResizeParams {
  oldWidth: number;
  oldHeight: number;
  newWidth: number;
  newHeight: number;
  offsetX: number;  // cols old data shifts right
  offsetY: number;  // rows old data shifts down
}

/**
 * Create a new color array of newWidth*newHeight filled with fillColor,
 * then copy old data at the given offset. Data outside new bounds is discarded.
 */
export function resizeColorArray(
  oldColors: number[],
  params: ResizeParams,
  fillColor: number,
): number[] {
  const { oldWidth, oldHeight, newWidth, newHeight, offsetX, offsetY } = params;
  const result = new Array(newWidth * newHeight).fill(fillColor);

  for (let oldY = 0; oldY < oldHeight; oldY++) {
    const newY = oldY + offsetY;
    if (newY < 0 || newY >= newHeight) continue;

    for (let oldX = 0; oldX < oldWidth; oldX++) {
      const newX = oldX + offsetX;
      if (newX < 0 || newX >= newWidth) continue;

      result[newY * newWidth + newX] = oldColors[oldY * oldWidth + oldX];
    }
  }

  return result;
}

/** Return a new PlacedPrefab with shifted coordinates */
export function shiftPlacedPrefab(
  prefab: PlacedPrefab,
  dx: number,
  dy: number,
): PlacedPrefab {
  return { ...prefab, x: prefab.x + dx, y: prefab.y + dy };
}
