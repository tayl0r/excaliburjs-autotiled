/** Shared DOM construction and canvas rendering helpers for prefab editor panels */

/** Result of buildCanvasLayout: the container element and its child elements */
export interface CanvasLayout {
  element: HTMLDivElement;
  statusBar: HTMLDivElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** Build a standard panel layout: status bar on top, scrollable canvas below */
export function buildCanvasLayout(): CanvasLayout {
  const element = document.createElement('div');
  element.style.cssText = `
    width: 100%; height: 100%;
    display: flex; flex-direction: column;
    position: relative;
  `;

  const statusBar = document.createElement('div');
  statusBar.style.cssText = `
    flex-shrink: 0; padding: 4px 8px;
    background: #16213e; border-bottom: 1px solid #333;
    font-size: 11px; color: #999; text-align: center;
  `;
  element.appendChild(statusBar);

  const scrollArea = document.createElement('div');
  scrollArea.style.cssText = 'flex: 1; overflow: auto; cursor: crosshair;';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'image-rendering: pixelated;';
  scrollArea.appendChild(canvas);
  element.appendChild(scrollArea);

  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  return { element, statusBar, canvas, ctx };
}

/** Draw a grid of lines on a canvas context */
export function drawGridLines(
  ctx: CanvasRenderingContext2D,
  cols: number, rows: number,
  tw: number, th: number,
  color: string,
): void {
  const cw = cols * tw;
  const ch = rows * th;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let c = 0; c <= cols; c++) {
    const x = c * tw;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, ch);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    const y = r * th;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(cw, y + 0.5);
    ctx.stroke();
  }
}

/** Attach a Ctrl/Meta+scroll wheel zoom handler to an element */
export function attachWheelZoom(
  element: HTMLElement,
  getZoom: () => number,
  setZoom: (z: number) => void,
): void {
  element.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = Math.pow(1.01, -e.deltaY);
      setZoom(getZoom() * factor);
    }
  }, { passive: false });
}
