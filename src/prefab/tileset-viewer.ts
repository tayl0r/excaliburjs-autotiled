import { PrefabEditorState } from './prefab-state.js';
import { colRowFromTileId, tileIdFromColRow, computeTileBounds } from '../utils/tile-math.js';
import { buildCanvasLayout, drawGridLines, attachWheelZoom } from './canvas-helpers.js';

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

    const layout = buildCanvasLayout();
    this.element = layout.element;
    this.statusBar = layout.statusBar;
    this.canvas = layout.canvas;
    this.ctx = layout.ctx;

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
    const name = this.state.activeTileset.tilesetImage.replace(/\.\w+$/, '');
    const sel = this.state.selectedTileIds;
    if (sel.length > 0) {
      const { minCol, maxCol, minRow, maxRow } = computeTileBounds(sel, this.state.columns);
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

    attachWheelZoom(
      this.element,
      () => this.state.tilesetZoom,
      (z) => this.state.setTilesetZoom(z),
    );
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

    drawGridLines(this.ctx, columns, rows, tw, th, 'rgba(255,255,255,0.1)');

    // Hover highlight
    if (this.hoveredTileId >= 0) {
      const [hc, hr] = colRowFromTileId(this.hoveredTileId, columns);
      this.ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(hc * tw + 1, hr * th + 1, tw - 2, th - 2);
    }

    // Selection highlights
    const selectedIds = this.state.selectedTileIds;
    if (selectedIds.length > 0) {
      this.ctx.strokeStyle = '#ffdd00';
      this.ctx.lineWidth = 2;
      for (const selId of selectedIds) {
        const [sc, sr] = colRowFromTileId(selId, columns);
        this.ctx.strokeRect(sc * tw + 1, sr * th + 1, tw - 2, th - 2);
      }
    }
  }
}
