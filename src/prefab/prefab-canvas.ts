import type { PrefabTile } from '../core/prefab-schema.js';
import { PrefabEditorState } from './prefab-state.js';
import { colRowFromTileId } from '../utils/tile-math.js';

export class PrefabCanvasPanel {
  readonly element: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: PrefabEditorState;
  private images: HTMLImageElement[];
  private hoverGridX = -1;
  private hoverGridY = -1;
  private statusBar: HTMLDivElement;

  // Move tool state
  private moveSelectedTiles: PrefabTile[] = [];
  private movePhase: 'idle' | 'selecting' | 'selected' | 'dragging' = 'idle';
  private selectStartX = -1;
  private selectStartY = -1;
  private selectEndX = -1;
  private selectEndY = -1;
  private dragStartX = -1;
  private dragStartY = -1;
  private dragCurrentX = -1;
  private dragCurrentY = -1;

  // Paint/erase drag state
  private painting = false;
  private erasing = false;

  // Copy tool state
  private copySelecting = false;

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

    this.setupEvents();

    this.state.on('activePrefabChanged', () => { this.updateStatusBar(); this.render(); });
    this.state.on('prefabDataChanged', () => { this.updateStatusBar(); this.render(); });
    this.state.on('tileSelectionChanged', () => this.render());
    this.state.on('toolChanged', () => this.render());
    this.state.on('zoomChanged', () => { this.updateStatusBar(); this.render(); });

    this.updateStatusBar();
    this.render();
  }

  private updateStatusBar(): void {
    const prefab = this.state.activePrefab;
    if (prefab) {
      const w = this.state.prefabWidth;
      const h = this.state.prefabHeight;
      this.statusBar.textContent = `prefab: ${prefab.name} (${w}x${h})`;
    } else {
      this.statusBar.textContent = 'prefab: (none)';
    }
  }

  private clearMoveState(): void {
    this.moveSelectedTiles = [];
    this.movePhase = 'idle';
    this.selectStartX = -1;
    this.selectStartY = -1;
    this.selectEndX = -1;
    this.selectEndY = -1;
    this.dragStartX = -1;
    this.dragStartY = -1;
    this.dragCurrentX = -1;
    this.dragCurrentY = -1;
  }

  private isTileSelected(gx: number, gy: number): boolean {
    return this.moveSelectedTiles.some(t => t.x === gx && t.y === gy);
  }

  private setupEvents(): void {
    this.canvas.addEventListener('click', (e) => {
      if (this.state.tool !== 'anchor') return;
      const pos = this.gridPosAtMouse(e);
      if (!pos) return;
      this.state.setAnchor(pos.gx, pos.gy);
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state.tool === 'paint') {
        const pos = this.gridPosAtMouse(e);
        if (!pos) return;
        this.painting = true;
        const stamps = this.computeStampTiles(pos.gx, pos.gy);
        if (stamps.length > 0) {
          this.state.placeTiles(stamps);
        }
        return;
      }
      if (this.state.tool === 'erase') {
        const pos = this.gridPosAtMouse(e);
        if (!pos) return;
        this.erasing = true;
        this.state.eraseTile(pos.gx, pos.gy);
        return;
      }
      if (this.state.tool === 'copy') {
        const pos = this.gridPosAtMouse(e);
        if (!pos) return;
        this.copySelecting = true;
        this.selectStartX = pos.gx;
        this.selectStartY = pos.gy;
        this.selectEndX = pos.gx;
        this.selectEndY = pos.gy;
        this.render();
        return;
      }
      if (this.state.tool !== 'move') return;
      const pos = this.gridPosAtMouse(e);
      if (!pos) return;
      const { gx, gy } = pos;

      if (this.movePhase === 'selected' && this.isTileSelected(gx, gy)) {
        // Start dragging selected tiles
        this.movePhase = 'dragging';
        this.dragStartX = gx;
        this.dragStartY = gy;
        this.dragCurrentX = gx;
        this.dragCurrentY = gy;
      } else {
        // Start new selection rectangle
        this.moveSelectedTiles = [];
        this.movePhase = 'selecting';
        this.selectStartX = gx;
        this.selectStartY = gy;
        this.selectEndX = gx;
        this.selectEndY = gy;
      }
      this.render();
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const pos = this.gridPosAtMouse(e);

      if (this.painting && this.state.tool === 'paint' && pos) {
        if (pos.gx !== this.hoverGridX || pos.gy !== this.hoverGridY) {
          this.hoverGridX = pos.gx;
          this.hoverGridY = pos.gy;
          const stamps = this.computeStampTiles(pos.gx, pos.gy);
          if (stamps.length > 0) {
            this.state.placeTiles(stamps);
          }
          this.render();
        }
        return;
      }

      if (this.erasing && this.state.tool === 'erase' && pos) {
        if (pos.gx !== this.hoverGridX || pos.gy !== this.hoverGridY) {
          this.hoverGridX = pos.gx;
          this.hoverGridY = pos.gy;
          this.state.eraseTile(pos.gx, pos.gy);
          this.render();
        }
        return;
      }

      if (this.state.tool === 'copy' && this.copySelecting && pos) {
        this.selectEndX = pos.gx;
        this.selectEndY = pos.gy;
        this.render();
        return;
      }

      if (this.state.tool === 'move') {
        if (this.movePhase === 'selecting' && pos) {
          this.selectEndX = pos.gx;
          this.selectEndY = pos.gy;
          this.render();
          return;
        }
        if (this.movePhase === 'dragging' && pos) {
          this.dragCurrentX = pos.gx;
          this.dragCurrentY = pos.gy;
          this.render();
          return;
        }
      }

      if (pos) {
        if (pos.gx !== this.hoverGridX || pos.gy !== this.hoverGridY) {
          this.hoverGridX = pos.gx;
          this.hoverGridY = pos.gy;
          this.render();
        }
      } else if (this.hoverGridX !== -1) {
        this.hoverGridX = -1;
        this.hoverGridY = -1;
        this.render();
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      this.painting = false;
      this.erasing = false;
      if (this.state.tool === 'copy' && this.copySelecting) {
        this.copySelecting = false;
        const prefab = this.state.activePrefab;
        if (prefab) {
          const minX = Math.min(this.selectStartX, this.selectEndX);
          const maxX = Math.max(this.selectStartX, this.selectEndX);
          const minY = Math.min(this.selectStartY, this.selectEndY);
          const maxY = Math.max(this.selectStartY, this.selectEndY);
          const tiles = prefab.tiles.filter(
            t => t.x >= minX && t.x <= maxX && t.y >= minY && t.y <= maxY,
          );
          this.state.setCopiedStamp(tiles);
        }
        this.render();
        return;
      }
      if (this.state.tool !== 'move') return;
      const pos = this.gridPosAtMouse(e);

      if (this.movePhase === 'selecting') {
        // Find all prefab tiles within the selection rectangle
        const prefab = this.state.activePrefab;
        if (prefab && pos) {
          const minX = Math.min(this.selectStartX, this.selectEndX);
          const maxX = Math.max(this.selectStartX, this.selectEndX);
          const minY = Math.min(this.selectStartY, this.selectEndY);
          const maxY = Math.max(this.selectStartY, this.selectEndY);

          this.moveSelectedTiles = prefab.tiles.filter(
            t => t.x >= minX && t.x <= maxX && t.y >= minY && t.y <= maxY,
          );
          this.movePhase = this.moveSelectedTiles.length > 0 ? 'selected' : 'idle';
        } else {
          this.movePhase = 'idle';
        }
        this.render();
      } else if (this.movePhase === 'dragging') {
        const dx = this.dragCurrentX - this.dragStartX;
        const dy = this.dragCurrentY - this.dragStartY;
        if (dx !== 0 || dy !== 0) {
          this.state.moveTiles(this.moveSelectedTiles, dx, dy);
          // Update selected tiles to reflect new positions
          this.moveSelectedTiles = this.moveSelectedTiles.map(t => ({
            ...t, x: t.x + dx, y: t.y + dy,
          }));
        }
        this.movePhase = 'selected';
        this.render();
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverGridX = -1;
      this.hoverGridY = -1;
      this.render();
    });

    this.element.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = Math.pow(1.01, -e.deltaY);
        this.state.setPrefabZoom(this.state.prefabZoom * factor);
      }
    }, { passive: false });

    // Clear tool state when tool changes
    this.state.on('toolChanged', () => {
      if (this.state.tool !== 'move') {
        this.clearMoveState();
      }
      if (this.state.tool !== 'copy') {
        this.copySelecting = false;
      }
      this.render();
    });
  }

  private gridPosAtMouse(e: MouseEvent): { gx: number; gy: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const zoom = this.state.prefabZoom;
    const tw = this.state.tileWidth * zoom;
    const th = this.state.tileHeight * zoom;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gx = Math.floor(x / tw);
    const gy = Math.floor(y / th);

    if (gx < 0 || gy < 0 || gx >= this.state.canvasWidth || gy >= this.state.canvasHeight) return null;
    return { gx, gy };
  }

  private computeStampTiles(cursorX: number, cursorY: number): PrefabTile[] {
    // Use copied stamp if available
    const stamp = this.state.copiedStamp;
    if (stamp.length > 0) {
      return stamp.map(t => ({ ...t, x: t.x + cursorX, y: t.y + cursorY }));
    }

    const selectedIds = this.state.selectedTileIds;
    if (selectedIds.length === 0) return [];

    const columns = this.state.columns;
    const tilesetIndex = this.state.activeTilesetIndex;

    // Compute bounding box of selected tiles
    let minCol = Infinity, minRow = Infinity;
    for (const id of selectedIds) {
      const [c, r] = colRowFromTileId(id, columns);
      if (c < minCol) minCol = c;
      if (r < minRow) minRow = r;
    }

    const tiles: PrefabTile[] = [];
    for (const id of selectedIds) {
      const [c, r] = colRowFromTileId(id, columns);
      tiles.push({
        x: cursorX + (c - minCol),
        y: cursorY + (r - minRow),
        tileId: id,
        tilesetIndex,
      });
    }
    return tiles;
  }

  render(): void {
    const prefab = this.state.activePrefab;
    const zoom = this.state.prefabZoom;
    const tileWidth = this.state.tileWidth;
    const tileHeight = this.state.tileHeight;
    const tw = tileWidth * zoom;
    const th = tileHeight * zoom;
    const canvasW = this.state.canvasWidth;
    const canvasH = this.state.canvasHeight;

    const cw = canvasW * tw;
    const ch = canvasH * th;
    this.canvas.width = cw;
    this.canvas.height = ch;

    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, cw, ch);

    // Draw grid lines
    this.ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    this.ctx.lineWidth = 1;
    for (let c = 0; c <= canvasW; c++) {
      const x = c * tw;
      this.ctx.beginPath();
      this.ctx.moveTo(x + 0.5, 0);
      this.ctx.lineTo(x + 0.5, ch);
      this.ctx.stroke();
    }
    for (let r = 0; r <= canvasH; r++) {
      const y = r * th;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y + 0.5);
      this.ctx.lineTo(cw, y + 0.5);
      this.ctx.stroke();
    }

    if (!prefab) {
      this.ctx.fillStyle = '#555';
      this.ctx.font = '14px sans-serif';
      this.ctx.fillText('Select or create a prefab', 16, 28);
      return;
    }

    // Draw placed tiles
    for (const tile of prefab.tiles) {
      const img = this.images[tile.tilesetIndex];
      if (!img) continue;
      const ts = this.state.metadata.tilesets[tile.tilesetIndex];
      if (!ts) continue;

      const sx = (tile.tileId % ts.columns) * ts.tileWidth;
      const sy = Math.floor(tile.tileId / ts.columns) * ts.tileHeight;
      this.ctx.drawImage(
        img,
        sx, sy, ts.tileWidth, ts.tileHeight,
        tile.x * tw, tile.y * th, tw, th,
      );
    }

    // Draw anchor highlight
    this.ctx.strokeStyle = '#ff4444';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(
      prefab.anchorX * tw + 1,
      prefab.anchorY * th + 1,
      tw - 2, th - 2,
    );
    // Small "A" label on anchor
    this.ctx.fillStyle = 'rgba(255, 68, 68, 0.7)';
    this.ctx.font = 'bold 10px monospace';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText('A', prefab.anchorX * tw + 3, prefab.anchorY * th + 2);

    // Draw stamp preview on hover (tool=paint, tiles selected)
    if (this.hoverGridX >= 0 && this.state.tool === 'paint') {
      const stamps = this.computeStampTiles(this.hoverGridX, this.hoverGridY);
      if (stamps.length > 0) {
        this.ctx.globalAlpha = 0.4;
        for (const tile of stamps) {
          const img = this.images[tile.tilesetIndex];
          if (!img) continue;
          const ts = this.state.metadata.tilesets[tile.tilesetIndex];
          if (!ts) continue;

          const sx = (tile.tileId % ts.columns) * ts.tileWidth;
          const sy = Math.floor(tile.tileId / ts.columns) * ts.tileHeight;
          this.ctx.drawImage(
            img,
            sx, sy, ts.tileWidth, ts.tileHeight,
            tile.x * tw, tile.y * th, tw, th,
          );
        }
        this.ctx.globalAlpha = 1.0;
      }
    }

    // Copy tool selection rectangle
    if (this.state.tool === 'copy' && this.copySelecting) {
      const minX = Math.min(this.selectStartX, this.selectEndX);
      const maxX = Math.max(this.selectStartX, this.selectEndX);
      const minY = Math.min(this.selectStartY, this.selectEndY);
      const maxY = Math.max(this.selectStartY, this.selectEndY);
      this.ctx.fillStyle = 'rgba(100, 255, 100, 0.15)';
      this.ctx.fillRect(minX * tw, minY * th, (maxX - minX + 1) * tw, (maxY - minY + 1) * th);
      this.ctx.strokeStyle = 'rgba(100, 255, 100, 0.6)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(minX * tw + 1, minY * th + 1, (maxX - minX + 1) * tw - 2, (maxY - minY + 1) * th - 2);
    }

    // Move tool overlays
    if (this.state.tool === 'move') {
      if (this.movePhase === 'selecting') {
        // Draw rubber-band selection rectangle
        const minX = Math.min(this.selectStartX, this.selectEndX);
        const maxX = Math.max(this.selectStartX, this.selectEndX);
        const minY = Math.min(this.selectStartY, this.selectEndY);
        const maxY = Math.max(this.selectStartY, this.selectEndY);
        this.ctx.fillStyle = 'rgba(100, 100, 255, 0.15)';
        this.ctx.fillRect(minX * tw, minY * th, (maxX - minX + 1) * tw, (maxY - minY + 1) * th);
        this.ctx.strokeStyle = 'rgba(100, 100, 255, 0.6)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(minX * tw + 1, minY * th + 1, (maxX - minX + 1) * tw - 2, (maxY - minY + 1) * th - 2);
      }

      if (this.movePhase === 'selected' || this.movePhase === 'dragging') {
        // Highlight selected tiles
        this.ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
        this.ctx.lineWidth = 2;
        for (const t of this.moveSelectedTiles) {
          this.ctx.strokeRect(t.x * tw + 1, t.y * th + 1, tw - 2, th - 2);
        }
      }

      if (this.movePhase === 'dragging') {
        const dx = this.dragCurrentX - this.dragStartX;
        const dy = this.dragCurrentY - this.dragStartY;

        // Dim original positions
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        for (const t of this.moveSelectedTiles) {
          this.ctx.fillRect(t.x * tw, t.y * th, tw, th);
        }

        // Draw ghost tiles at offset position
        this.ctx.globalAlpha = 0.4;
        for (const t of this.moveSelectedTiles) {
          const img = this.images[t.tilesetIndex];
          if (!img) continue;
          const ts = this.state.metadata.tilesets[t.tilesetIndex];
          if (!ts) continue;
          const sx = (t.tileId % ts.columns) * ts.tileWidth;
          const sy = Math.floor(t.tileId / ts.columns) * ts.tileHeight;
          this.ctx.drawImage(
            img,
            sx, sy, ts.tileWidth, ts.tileHeight,
            (t.x + dx) * tw, (t.y + dy) * th, tw, th,
          );
        }
        this.ctx.globalAlpha = 1.0;

        // Outline ghost positions
        this.ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
        this.ctx.lineWidth = 2;
        for (const t of this.moveSelectedTiles) {
          this.ctx.strokeRect((t.x + dx) * tw + 1, (t.y + dy) * th + 1, tw - 2, th - 2);
        }
      }
    }

    // Draw cursor highlight on hover
    if (this.hoverGridX >= 0) {
      const cursorColor = this.state.tool === 'erase' ? 'rgba(255,100,100,0.6)' :
                          this.state.tool === 'anchor' ? 'rgba(255,200,50,0.6)' :
                          'rgba(255,255,255,0.4)';
      this.ctx.strokeStyle = cursorColor;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        this.hoverGridX * tw + 1,
        this.hoverGridY * th + 1,
        tw - 2, th - 2,
      );
    }
  }
}
