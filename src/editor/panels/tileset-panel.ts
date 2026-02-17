import { EditorState, TileFilter } from '../editor-state.js';
import { colRowFromTileId, tileIdFromColRow } from '../../utils/tile-math.js';
import { templateSlotWangId } from '../template-utils.js';

/**
 * Spritesheet viewer panel rendered on an HTML canvas.
 * Supports zoom, tile selection (yellow border), hover tooltip with tile ID,
 * and colored corner overlays for tiles that have WangId mappings.
 */
export class TilesetPanel {
  readonly element: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: EditorState;
  private image: HTMLImageElement;
  private hoveredTileId: number = -1;
  private tooltip: HTMLDivElement;
  private filterButtons: HTMLButtonElement[] = [];

  constructor(state: EditorState, image: HTMLImageElement) {
    this.state = state;
    this.image = image;

    this.element = document.createElement('div');
    this.element.style.cssText = `
      width: 100%; height: 100%;
      overflow: auto;
      position: relative;
      cursor: crosshair;
    `;

    // Filter bar
    const filterBar = document.createElement('div');
    filterBar.style.cssText = `
      display: flex; gap: 4px; padding: 4px 8px;
      background: #16213e; border-bottom: 1px solid #333;
    `;
    const filters: TileFilter[] = ['all', 'tagged', 'untagged'];
    for (const mode of filters) {
      const btn = document.createElement('button');
      btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      btn.dataset.filter = mode;
      btn.style.cssText = `
        padding: 2px 10px; border: 1px solid #555; border-radius: 3px;
        cursor: pointer; font-size: 11px; font-family: inherit;
        background: ${mode === 'all' ? '#333' : 'transparent'};
        color: ${mode === 'all' ? '#e0e0e0' : '#888'};
      `;
      btn.addEventListener('click', () => this.state.setTileFilter(mode));
      filterBar.appendChild(btn);
      this.filterButtons.push(btn);
    }
    this.element.appendChild(filterBar);

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'image-rendering: pixelated;';
    this.element.appendChild(this.canvas);

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
    this.state.on('selectedTileChanged', () => this.render());
    this.state.on('metadataChanged', () => this.render());
    this.state.on('zoomChanged', () => this.render());
    this.state.on('activeWangSetChanged', () => this.render());
    this.state.on('activeColorChanged', () => this.render());
    this.state.on('templateSlotChanged', () => this.render());
    this.state.on('templateModeChanged', () => this.render());
  }

  private setupEvents(): void {
    this.canvas.addEventListener('click', (e) => {
      const tileId = this.tileIdAtMouse(e);
      if (tileId >= 0) {
        if (this.state.templateMode && this.state.activeTemplateSlot >= 0) {
          const wangid = templateSlotWangId(
            this.state.activeTemplateSlot,
            this.state.templateColorA,
            this.state.templateColorB,
          );
          this.state.setWangId(tileId, wangid);
          // Advance to next slot, deactivate after last
          if (this.state.activeTemplateSlot < 15) {
            this.state.setActiveTemplateSlot(this.state.activeTemplateSlot + 1);
          } else {
            this.state.setActiveTemplateSlot(-1);
          }
          return;
        }

        // Shift-click for range selection
        if (e.shiftKey && this.state.selectedTileId >= 0) {
          this.state.selectTileRange(this.state.selectedTileId, tileId);
          return;
        }

        this.state.selectTile(tileId);
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const tileId = this.tileIdAtMouse(e);
      if (tileId !== this.hoveredTileId) {
        this.hoveredTileId = tileId;
        this.render();
      }
      if (tileId >= 0) {
        const [col, row] = colRowFromTileId(tileId, this.state.metadata.columns);
        this.tooltip.textContent = `Tile ${tileId} (${col}, ${row})`;
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = `${e.clientX + 12}px`;
        this.tooltip.style.top = `${e.clientY + 12}px`;
      } else {
        this.tooltip.style.display = 'none';
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredTileId = -1;
      this.tooltip.style.display = 'none';
      this.render();
    });

    // Zoom with scroll wheel
    this.element.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        this.state.setZoom(this.state.zoom + delta);
      }
    }, { passive: false });
  }

  private tileIdAtMouse(e: MouseEvent): number {
    const rect = this.canvas.getBoundingClientRect();
    const zoom = this.state.zoom;
    const tw = this.state.metadata.tileWidth * zoom;
    const th = this.state.metadata.tileHeight * zoom;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.floor(x / tw);
    const row = Math.floor(y / th);

    if (col < 0 || col >= this.state.metadata.columns) return -1;
    const tileId = tileIdFromColRow(col, row, this.state.metadata.columns);
    if (tileId >= this.state.metadata.tileCount) return -1;

    return tileId;
  }

  render(): void {
    const { tileWidth, tileHeight, columns, tileCount } = this.state.metadata;
    const zoom = this.state.zoom;
    const rows = Math.ceil(tileCount / columns);

    const cw = columns * tileWidth * zoom;
    const ch = rows * tileHeight * zoom;
    this.canvas.width = cw;
    this.canvas.height = ch;

    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, cw, ch);

    // Draw spritesheet
    this.ctx.drawImage(this.image, 0, 0, cw, ch);

    // Draw grid lines
    this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    this.ctx.lineWidth = 1;
    for (let c = 0; c <= columns; c++) {
      const x = c * tileWidth * zoom;
      this.ctx.beginPath();
      this.ctx.moveTo(x + 0.5, 0);
      this.ctx.lineTo(x + 0.5, ch);
      this.ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      const y = r * tileHeight * zoom;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y + 0.5);
      this.ctx.lineTo(cw, y + 0.5);
      this.ctx.stroke();
    }

    // Draw WangId overlays for tagged tiles
    this.drawWangOverlays(zoom);

    // Draw filter dimming overlay
    if (this.state.tileFilter !== 'all') {
      const ws = this.state.activeWangSet;
      const taggedTileIds = new Set(ws?.wangtiles.map(wt => wt.tileid) ?? []);
      const tw = tileWidth * zoom;
      const th = tileHeight * zoom;

      for (let id = 0; id < tileCount; id++) {
        const isTagged = taggedTileIds.has(id);
        const shouldDim = (this.state.tileFilter === 'tagged' && !isTagged) ||
                          (this.state.tileFilter === 'untagged' && isTagged);

        if (shouldDim) {
          const [col, row] = colRowFromTileId(id, columns);
          this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          this.ctx.fillRect(col * tw, row * th, tw, th);
        }
      }
    }

    // Update filter button styles
    for (const btn of this.filterButtons) {
      const isActive = btn.dataset.filter === this.state.tileFilter;
      btn.style.background = isActive ? '#333' : 'transparent';
      btn.style.color = isActive ? '#e0e0e0' : '#888';
    }

    // Draw light blue outline on tiles matching active WangSet + color
    this.drawActiveColorOutlines(zoom);

    // Draw hover highlight
    if (this.hoveredTileId >= 0) {
      const [hc, hr] = colRowFromTileId(this.hoveredTileId, columns);
      this.ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        hc * tileWidth * zoom + 1,
        hr * tileHeight * zoom + 1,
        tileWidth * zoom - 2,
        tileHeight * zoom - 2
      );
    }

    // Draw selection highlights (multi-select)
    for (const selId of this.state.selectedTileIds) {
      const [sc, sr] = colRowFromTileId(selId, columns);
      this.ctx.strokeStyle = '#ffdd00';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        sc * tileWidth * zoom + 1,
        sr * tileHeight * zoom + 1,
        tileWidth * zoom - 2,
        tileHeight * zoom - 2
      );
    }
  }

  private drawActiveColorOutlines(zoom: number): void {
    const ws = this.state.activeWangSet;
    const colorId = this.state.activeColorId;
    if (!ws || colorId <= 0) return;

    const { tileWidth, tileHeight, columns } = this.state.metadata;
    const tw = tileWidth * zoom;
    const th = tileHeight * zoom;

    this.ctx.strokeStyle = 'rgba(100, 180, 255, 0.7)';
    this.ctx.lineWidth = 2;

    for (const wt of ws.wangtiles) {
      if (!wt.wangid.includes(colorId)) continue;
      const [col, row] = colRowFromTileId(wt.tileid, columns);
      this.ctx.strokeRect(
        col * tw + 1,
        row * th + 1,
        tw - 2,
        th - 2,
      );
    }
  }

  private drawWangOverlays(zoom: number): void {
    const ws = this.state.activeWangSet;
    if (!ws) return;

    const { tileWidth, tileHeight, columns } = this.state.metadata;
    const tw = tileWidth * zoom;
    const th = tileHeight * zoom;

    for (const wt of ws.wangtiles) {
      const [col, row] = colRowFromTileId(wt.tileid, columns);
      const x = col * tw;
      const y = row * th;

      // Draw corner color indicators (small triangles at each corner)
      const cornerPositions: [number, number, number][] = [
        [7, 0, 0],  // TopLeft
        [1, 1, 0],  // TopRight
        [3, 1, 1],  // BottomRight
        [5, 0, 1],  // BottomLeft
      ];

      for (const [wangIdx, cx, cy] of cornerPositions) {
        const colorId = wt.wangid[wangIdx];
        if (colorId === 0) continue;

        const wangColor = ws.colors[colorId - 1];
        if (!wangColor) continue;

        const cornerX = x + cx * tw;
        const cornerY = y + cy * th;
        const size = Math.max(4, tw * 0.25);

        this.ctx.fillStyle = wangColor.color + 'aa';
        this.ctx.beginPath();
        if (cx === 0 && cy === 0) {
          this.ctx.moveTo(cornerX, cornerY);
          this.ctx.lineTo(cornerX + size, cornerY);
          this.ctx.lineTo(cornerX, cornerY + size);
        } else if (cx === 1 && cy === 0) {
          this.ctx.moveTo(cornerX, cornerY);
          this.ctx.lineTo(cornerX - size, cornerY);
          this.ctx.lineTo(cornerX, cornerY + size);
        } else if (cx === 1 && cy === 1) {
          this.ctx.moveTo(cornerX, cornerY);
          this.ctx.lineTo(cornerX - size, cornerY);
          this.ctx.lineTo(cornerX, cornerY - size);
        } else {
          this.ctx.moveTo(cornerX, cornerY);
          this.ctx.lineTo(cornerX + size, cornerY);
          this.ctx.lineTo(cornerX, cornerY - size);
        }
        this.ctx.closePath();
        this.ctx.fill();
      }
    }
  }

  destroy(): void {
    this.tooltip.remove();
  }
}
