import { EditorState } from '../editor-state.js';
import { colRowFromTileId } from '../../utils/tile-math.js';
import { computeAdjacencyPreview } from '../adjacency-preview.js';

/**
 * Tile inspector panel with WangId zone editor.
 * Shows a zoomed tile preview, a 3x3 clickable grid for corner/edge painting,
 * and the raw WangId array.
 */
export class InspectorPanel {
  readonly element: HTMLDivElement;
  private state: EditorState;
  private image: HTMLImageElement;
  private previewCanvas!: HTMLCanvasElement;
  private gridContainer!: HTMLDivElement;
  private wangIdDisplay!: HTMLDivElement;
  private infoDisplay!: HTMLDivElement;
  private probabilityContainer!: HTMLDivElement;
  private adjacencyContainer!: HTMLDivElement;
  private adjacencyLabel!: HTMLDivElement;

  constructor(state: EditorState, image: HTMLImageElement) {
    this.state = state;
    this.image = image;

    this.element = document.createElement('div');
    this.buildUI();

    this.state.on('selectedTileChanged', () => this.render());
    this.state.on('activeColorChanged', () => this.render());
    this.state.on('metadataChanged', () => this.render());
    this.state.on('activeWangSetChanged', () => this.render());

    this.render();
  }

  private buildUI(): void {
    const header = document.createElement('h3');
    header.textContent = 'Inspector';
    header.style.cssText = 'margin: 0 0 8px 0; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 1px;';
    this.element.appendChild(header);

    // Info display
    this.infoDisplay = document.createElement('div');
    this.infoDisplay.style.cssText = 'margin-bottom: 8px; font-size: 12px; color: #888;';
    this.element.appendChild(this.infoDisplay);

    // Tile preview
    this.previewCanvas = document.createElement('canvas');
    this.previewCanvas.width = 128;
    this.previewCanvas.height = 128;
    this.previewCanvas.style.cssText = `
      image-rendering: pixelated;
      border: 1px solid #444;
      border-radius: 4px;
      margin-bottom: 12px;
      background: #111;
    `;
    this.element.appendChild(this.previewCanvas);

    // 3x3 WangId grid label
    const gridLabel = document.createElement('div');
    gridLabel.textContent = 'WangId Zones';
    gridLabel.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px;';
    this.element.appendChild(gridLabel);

    // 3x3 grid + fill button row
    const gridRow = document.createElement('div');
    gridRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;';

    this.gridContainer = document.createElement('div');
    this.gridContainer.style.cssText = `
      display: grid;
      grid-template-columns: repeat(3, 40px);
      grid-template-rows: repeat(3, 40px);
      gap: 2px;
    `;
    gridRow.appendChild(this.gridContainer);

    const fillBtn = document.createElement('button');
    fillBtn.textContent = 'Fill';
    fillBtn.title = 'Set all zones to active color';
    fillBtn.style.cssText = `
      background: #2a2a3a; color: #aaa; border: 1px solid #555;
      padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;
      align-self: center;
    `;
    fillBtn.addEventListener('click', () => this.paintAllZones());
    gridRow.appendChild(fillBtn);

    this.element.appendChild(gridRow);

    // WangId array display
    const wangLabel = document.createElement('div');
    wangLabel.textContent = 'WangId';
    wangLabel.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px;';
    this.element.appendChild(wangLabel);

    this.wangIdDisplay = document.createElement('div');
    this.wangIdDisplay.style.cssText = `
      font-family: monospace; font-size: 12px;
      background: #111; padding: 6px 8px;
      border-radius: 3px; border: 1px solid #333;
      word-break: break-all;
    `;
    this.element.appendChild(this.wangIdDisplay);

    // Tile probability
    this.probabilityContainer = document.createElement('div');
    this.probabilityContainer.style.cssText = 'margin-top: 8px; margin-bottom: 8px;';
    this.element.appendChild(this.probabilityContainer);

    // Action buttons
    const actions = document.createElement('div');
    actions.style.cssText = 'margin-top: 12px; display: flex; flex-direction: column; gap: 4px;';

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear WangId';
    clearBtn.style.cssText = `
      background: #4a2020; color: #ccc; border: 1px solid #633;
      padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 12px;
    `;
    clearBtn.addEventListener('click', () => {
      if (this.state.selectedTileIds.size > 1) {
        this.state.removeWangTileMulti([...this.state.selectedTileIds]);
      } else if (this.state.selectedTileId >= 0) {
        this.state.removeWangTile(this.state.selectedTileId);
      }
    });
    actions.appendChild(clearBtn);

    this.element.appendChild(actions);

    // Adjacency Preview label
    this.adjacencyLabel = document.createElement('div');
    this.adjacencyLabel.textContent = 'Adjacency Preview';
    this.adjacencyLabel.style.cssText = 'font-size: 11px; color: #888; margin-top: 12px; margin-bottom: 4px;';
    this.element.appendChild(this.adjacencyLabel);

    // Adjacency Preview 3x3 grid
    this.adjacencyContainer = document.createElement('div');
    this.adjacencyContainer.style.cssText = `
      display: grid;
      grid-template-columns: repeat(3, 40px);
      grid-template-rows: repeat(3, 40px);
      gap: 2px;
      margin-bottom: 12px;
    `;
    this.element.appendChild(this.adjacencyContainer);
  }

  render(): void {
    const tileId = this.state.selectedTileId;

    if (tileId < 0) {
      this.infoDisplay.textContent = 'No tile selected';
      this.clearPreview();
      this.clearGrid();
      this.wangIdDisplay.textContent = '—';
      this.probabilityContainer.textContent = '';
      this.clearAdjacencyPreview();
      return;
    }

    // Info
    const [col, row] = colRowFromTileId(tileId, this.state.metadata.columns);
    if (this.state.selectedTileIds.size > 1) {
      this.infoDisplay.textContent = `${this.state.selectedTileIds.size} tiles selected (primary: ${tileId})`;
    } else {
      this.infoDisplay.textContent = `Tile ${tileId} (col ${col}, row ${row})`;
    }

    // Preview
    this.drawPreview(tileId);

    // Grid
    this.drawGrid(tileId);

    // WangId display
    const wt = this.state.getWangTile(tileId);
    this.wangIdDisplay.textContent = wt
      ? `[${wt.wangid.join(', ')}]`
      : 'Not tagged';

    this.renderProbability(tileId);

    // Adjacency preview
    this.drawAdjacencyPreview(tileId);
  }

  private drawPreview(tileId: number): void {
    const ctx = this.previewCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 128, 128);

    const { tileWidth, tileHeight, columns } = this.state.metadata;
    const [col, row] = colRowFromTileId(tileId, columns);

    ctx.drawImage(
      this.image,
      col * tileWidth, row * tileHeight, tileWidth, tileHeight,
      0, 0, 128, 128
    );
  }

  private clearPreview(): void {
    const ctx = this.previewCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 128);
  }

  private drawGrid(tileId: number): void {
    // Clear grid
    while (this.gridContainer.firstChild) {
      this.gridContainer.removeChild(this.gridContainer.firstChild);
    }

    const ws = this.state.activeWangSet;
    const wt = this.state.getWangTile(tileId);
    const wangid = wt ? wt.wangid : [0, 0, 0, 0, 0, 0, 0, 0];
    const type = ws?.type ?? 'corner';

    // 3x3 grid mapping: position -> wangId index
    // Layout:
    //   TL(7)  T(0)   TR(1)
    //   L(6)   center R(2)
    //   BL(5)  B(4)   BR(3)
    const gridMap: (number | null)[] = [
      7, 0, 1,
      6, null, 2,
      5, 4, 3,
    ];

    for (let i = 0; i < 9; i++) {
      const wangIdx = gridMap[i];
      const cell = document.createElement('div');

      if (wangIdx === null) {
        // Center cell: show tile icon
        cell.style.cssText = `
          background: #222;
          border: 1px solid #444;
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: #666;
        `;
        cell.textContent = 'tile';
      } else {
        const isCorner = wangIdx % 2 === 1;
        const isEdge = wangIdx % 2 === 0;
        const isActive = (type === 'corner' && isCorner)
          || (type === 'edge' && isEdge)
          || type === 'mixed';

        const colorId = wangid[wangIdx];
        const colorData = ws && colorId > 0 ? ws.colors[colorId - 1] : undefined;
        const bgColor = colorData ? colorData.color : '#222';

        cell.style.cssText = `
          background: ${bgColor};
          border: 1px solid ${isActive ? '#666' : '#333'};
          border-radius: 3px;
          cursor: ${isActive ? 'pointer' : 'default'};
          opacity: ${isActive ? '1' : '0.3'};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: rgba(255,255,255,0.7);
          transition: border-color 0.1s;
        `;
        cell.textContent = colorId > 0 ? String(colorId) : '';

        if (isActive) {
          cell.addEventListener('click', () => {
            this.paintZone(tileId, wangIdx);
          });
          cell.addEventListener('mouseenter', () => {
            cell.style.borderColor = '#999';
          });
          cell.addEventListener('mouseleave', () => {
            cell.style.borderColor = '#666';
          });
        }
      }

      this.gridContainer.appendChild(cell);
    }
  }

  private clearGrid(): void {
    while (this.gridContainer.firstChild) {
      this.gridContainer.removeChild(this.gridContainer.firstChild);
    }
  }

  private drawAdjacencyPreview(tileId: number): void {
    while (this.adjacencyContainer.firstChild) {
      this.adjacencyContainer.removeChild(this.adjacencyContainer.firstChild);
    }

    const ws = this.state.activeWangSet;
    const wt = this.state.getWangTile(tileId);

    if (!ws || !wt) {
      this.adjacencyLabel.style.display = 'none';
      this.adjacencyContainer.style.display = 'none';
      return;
    }

    this.adjacencyLabel.style.display = '';
    this.adjacencyContainer.style.display = 'grid';

    const result = computeAdjacencyPreview(wt.wangid, ws);

    // Set the center tile's actual tileId
    if (result.tiles[4]) {
      result.tiles[4].tileId = tileId;
    }

    const { tileWidth, tileHeight, columns } = this.state.metadata;

    for (let i = 0; i < 9; i++) {
      const tile = result.tiles[i];
      const isCenter = i === 4;

      if (tile && tile.tileId >= 0) {
        // Draw the tile image on a small canvas
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        canvas.style.cssText = `
          image-rendering: pixelated;
          border: 2px solid ${isCenter ? '#cc0' : '#333'};
          border-radius: 3px;
          background: #111;
        `;

        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        const [col, row] = colRowFromTileId(tile.tileId, columns);
        ctx.drawImage(
          this.image,
          col * tileWidth, row * tileHeight, tileWidth, tileHeight,
          0, 0, 40, 40,
        );

        this.adjacencyContainer.appendChild(canvas);
      } else {
        // Empty cell with "?" indicator
        const cell = document.createElement('div');
        cell.style.cssText = `
          width: 40px;
          height: 40px;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: #444;
          box-sizing: border-box;
        `;
        cell.textContent = '?';
        this.adjacencyContainer.appendChild(cell);
      }
    }
  }

  private clearAdjacencyPreview(): void {
    while (this.adjacencyContainer.firstChild) {
      this.adjacencyContainer.removeChild(this.adjacencyContainer.firstChild);
    }
    this.adjacencyLabel.style.display = 'none';
    this.adjacencyContainer.style.display = 'none';
  }

  private renderProbability(tileId: number): void {
    while (this.probabilityContainer.firstChild) {
      this.probabilityContainer.removeChild(this.probabilityContainer.firstChild);
    }
    const wt = this.state.getWangTile(tileId);
    if (!wt) return;

    const prob = wt.probability ?? 1.0;
    const isDefault = prob === 1.0;

    const label = document.createElement('span');
    label.textContent = 'Tile Prob ';
    label.style.cssText = 'font-size: 11px; color: #888;';
    this.probabilityContainer.appendChild(label);

    const badge = document.createElement('span');
    badge.textContent = `P:${+prob.toPrecision(4)}`;
    badge.style.cssText = `
      font-size: 10px; color: ${isDefault ? '#888' : '#eeb300'};
      background: #2a2a2a; padding: 0 4px;
      border-radius: 2px; border: 1px solid ${isDefault ? '#444' : '#887700'};
      cursor: pointer; user-select: none;
    `;
    badge.title = 'Click to edit tile probability';
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startTileProbabilityEdit(badge, tileId);
    });
    this.probabilityContainer.appendChild(badge);
  }

  private startTileProbabilityEdit(badge: HTMLSpanElement, tileId: number): void {
    const wt = this.state.getWangTile(tileId);
    if (!wt) return;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.1';
    input.value = String(wt.probability ?? 1.0);
    input.style.cssText = `
      width: 48px; background: #1e1e3a; color: #e0e0e0; border: 1px solid #6666cc;
      font-size: 11px; padding: 1px 4px; border-radius: 2px; outline: none;
    `;

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const val = parseFloat(input.value);
      if (!isNaN(val) && val >= 0) {
        if (this.state.selectedTileIds.size > 1) {
          this.state.setTileProbabilityMulti([...this.state.selectedTileIds], val);
        } else {
          this.state.setTileProbability(tileId, val);
        }
      }
      this.render();
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { committed = true; this.render(); }
    });
    input.addEventListener('blur', commit);

    badge.replaceWith(input);
    input.focus();
    input.select();
  }

  private paintAllZones(): void {
    const tileId = this.state.selectedTileId;
    if (tileId < 0) return;
    const ws = this.state.activeWangSet;
    if (!ws) return;

    const type = ws.type;
    const colorId = this.state.activeColorId;

    const fillWangid = (base: number[]): number[] => {
      const wangid = [...base];
      for (let i = 0; i < 8; i++) {
        const isCorner = i % 2 === 1;
        const isEdge = i % 2 === 0;
        if ((type === 'corner' && isCorner) || (type === 'edge' && isEdge) || type === 'mixed') {
          wangid[i] = colorId;
        }
      }
      return wangid;
    };

    if (this.state.selectedTileIds.size > 1) {
      const entries: Array<{ tileId: number; wangid: number[] }> = [];
      for (const selId of this.state.selectedTileIds) {
        const selWt = this.state.getWangTile(selId);
        entries.push({ tileId: selId, wangid: fillWangid(selWt ? selWt.wangid : [0, 0, 0, 0, 0, 0, 0, 0]) });
      }
      this.state.setWangIdMulti(entries);
    } else {
      const wt = this.state.getWangTile(tileId);
      this.state.setWangId(tileId, fillWangid(wt ? wt.wangid : [0, 0, 0, 0, 0, 0, 0, 0]));
    }
  }

  private paintZone(tileId: number, wangIdx: number): void {
    const wt = this.state.getWangTile(tileId);
    const wangid = wt ? [...wt.wangid] : [0, 0, 0, 0, 0, 0, 0, 0];

    const colorId = this.state.activeColorId;
    const newColor = wangid[wangIdx] === colorId ? 0 : colorId;
    wangid[wangIdx] = newColor;

    if (this.state.selectedTileIds.size > 1) {
      const entries: Array<{ tileId: number; wangid: number[] }> = [];
      for (const selId of this.state.selectedTileIds) {
        const selWt = this.state.getWangTile(selId);
        const selWangid = selWt ? [...selWt.wangid] : [0, 0, 0, 0, 0, 0, 0, 0];
        selWangid[wangIdx] = newColor;
        entries.push({ tileId: selId, wangid: selWangid });
      }
      this.state.setWangIdMulti(entries);
    } else {
      this.state.setWangId(tileId, wangid);
    }
  }
}
