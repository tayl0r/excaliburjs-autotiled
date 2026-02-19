import { PrefabEditorState } from './prefab-state.js';
import { colRowFromTileId, tileIdFromColRow } from '../utils/tile-math.js';

export class TilesetViewerPanel {
  readonly element: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: PrefabEditorState;
  private images: HTMLImageElement[];
  private hoveredTileId = -1;
  private tooltip: HTMLDivElement;
  private statusBar: HTMLDivElement;

  // Drag selection state
  private dragStartTileId = -1;
  private isDragging = false;

  constructor(state: PrefabEditorState, images: HTMLImageElement[]) {
    this.state = state;
    this.images = images;

    this.element = document.createElement('div');
    this.element.style.cssText = `
      width: 100%; height: 100%;
      display: flex; flex-direction: column;
      position: relative;
    `;

    // Status bar
    this.statusBar = document.createElement('div');
    this.statusBar.style.cssText = `
      flex-shrink: 0; padding: 4px 8px;
      background: #16213e; border-bottom: 1px solid #333;
      font-size: 11px; color: #999; text-align: center;
    `;
    this.element.appendChild(this.statusBar);

    const scrollArea = document.createElement('div');
    scrollArea.style.cssText = 'flex: 1; overflow: auto; cursor: crosshair;';

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'image-rendering: pixelated;';
    scrollArea.appendChild(this.canvas);
    this.element.appendChild(scrollArea);

    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;

    // Tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.style.cssText = `
      position: fixed;
      background: rgba(0,0,0,0.85);
      color: #fff;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 11px;
      pointer-events: none;
      display: none;
      z-index: 200;
      white-space: nowrap;
    `;
    document.body.appendChild(this.tooltip);

    this.setupEvents();
    this.state.on('tileSelectionChanged', () => { this.updateStatusBar(); this.render(); });
    this.state.on('zoomChanged', () => this.render());
    this.state.on('activeTilesetChanged', () => { this.updateStatusBar(); this.render(); });

    this.updateStatusBar();
    this.render();
  }

  private updateStatusBar(): void {
    const ts = this.state.activeTileset;
    const name = ts.tilesetImage.replace(/\.\w+$/, '');
    const sel = this.state.selectedTileIds;
    if (sel.length > 0) {
      // Compute selection dimensions
      let minCol = Infinity, maxCol = -1, minRow = Infinity, maxRow = -1;
      for (const id of sel) {
        const [c, r] = colRowFromTileId(id, this.state.columns);
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
      }
      const w = maxCol - minCol + 1;
      const h = maxRow - minRow + 1;
      this.statusBar.textContent = `tileset: ${name}  |  selected: ${sel.length} tiles (${w}x${h})`;
    } else {
      this.statusBar.textContent = `tileset: ${name}`;
    }
  }

  private setupEvents(): void {
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const tileId = this.tileIdAtMouse(e);
      if (tileId < 0) return;

      if (e.shiftKey && this.state.selectedTileIds.length > 0) {
        const lastSelected = this.state.selectedTileIds[this.state.selectedTileIds.length - 1];
        this.state.selectTileRange(lastSelected, tileId);
        return;
      }

      if (e.metaKey || e.ctrlKey) {
        this.state.toggleTileSelection(tileId);
        return;
      }

      // Start drag selection
      this.dragStartTileId = tileId;
      this.isDragging = false;
      this.state.selectTile(tileId);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const tileId = this.tileIdAtMouse(e);

      // Handle drag selection
      if (this.dragStartTileId >= 0 && e.buttons === 1) {
        if (tileId >= 0 && tileId !== this.dragStartTileId) {
          this.isDragging = true;
          this.state.selectTileRange(this.dragStartTileId, tileId);
        }
      }

      if (tileId !== this.hoveredTileId) {
        this.hoveredTileId = tileId;
        this.render();
      }
      if (tileId >= 0) {
        const [col, row] = colRowFromTileId(tileId, this.state.columns);
        this.tooltip.textContent = `Tile ${tileId} (${col}, ${row})`;
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = `${e.clientX + 12}px`;
        this.tooltip.style.top = `${e.clientY + 12}px`;
      } else {
        this.tooltip.style.display = 'none';
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      this.dragStartTileId = -1;
      this.isDragging = false;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.dragStartTileId = -1;
      this.isDragging = false;
      this.hoveredTileId = -1;
      this.tooltip.style.display = 'none';
      this.render();
    });

    this.element.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = Math.pow(1.01, -e.deltaY);
        this.state.setTilesetZoom(this.state.tilesetZoom * factor);
      }
    }, { passive: false });
  }

  private tileIdAtMouse(e: MouseEvent): number {
    const rect = this.canvas.getBoundingClientRect();
    const zoom = this.state.tilesetZoom;
    const tw = this.state.tileWidth * zoom;
    const th = this.state.tileHeight * zoom;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.floor(x / tw);
    const row = Math.floor(y / th);

    if (col < 0 || col >= this.state.columns) return -1;
    const tileId = tileIdFromColRow(col, row, this.state.columns);
    if (tileId >= this.state.tileCount) return -1;

    return tileId;
  }

  render(): void {
    const { tileWidth, tileHeight, columns, tileCount } = this.state;
    const zoom = this.state.tilesetZoom;
    const tw = tileWidth * zoom;
    const th = tileHeight * zoom;
    const rows = Math.ceil(tileCount / columns);

    const cw = columns * tw;
    const ch = rows * th;
    this.canvas.width = cw;
    this.canvas.height = ch;

    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, cw, ch);

    // Draw spritesheet
    this.ctx.drawImage(this.images[this.state.activeTilesetIndex], 0, 0, cw, ch);

    // Grid lines
    this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    this.ctx.lineWidth = 1;
    for (let c = 0; c <= columns; c++) {
      const x = c * tw;
      this.ctx.beginPath();
      this.ctx.moveTo(x + 0.5, 0);
      this.ctx.lineTo(x + 0.5, ch);
      this.ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      const y = r * th;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y + 0.5);
      this.ctx.lineTo(cw, y + 0.5);
      this.ctx.stroke();
    }

    // Hover highlight
    if (this.hoveredTileId >= 0) {
      const [hc, hr] = colRowFromTileId(this.hoveredTileId, columns);
      this.ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(hc * tw + 1, hr * th + 1, tw - 2, th - 2);
    }

    // Selection highlights
    for (const selId of this.state.selectedTileIds) {
      const [sc, sr] = colRowFromTileId(selId, columns);
      this.ctx.strokeStyle = '#ffdd00';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(sc * tw + 1, sr * th + 1, tw - 2, th - 2);
    }
  }
}
