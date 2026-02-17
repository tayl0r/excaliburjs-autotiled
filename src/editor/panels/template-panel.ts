import { EditorState } from '../editor-state.js';
import { TEMPLATE_SLOTS, templateSlotWangId } from '../template-utils.js';
import { colRowFromTileId } from '../../utils/tile-math.js';
import type { WangSetData } from '../../core/metadata-schema.js';

/**
 * Template panel for batch-tagging tiles using a 4x4 grid of Wang corner combinations.
 * Each cell represents one of the 16 possible A/B corner patterns.
 * Supports color selection, auto-fill from a selected tile origin, and clear all.
 */
export class TemplatePanel {
  readonly element: HTMLDivElement;
  private state: EditorState;
  private image: HTMLImageElement;

  /** Local mapping: slotIndex -> tileId */
  private slotAssignments = new Map<number, number>();

  private colorASelect!: HTMLSelectElement;
  private colorBSelect!: HTMLSelectElement;
  private gridContainer!: HTMLDivElement;

  constructor(state: EditorState, image: HTMLImageElement) {
    this.state = state;
    this.image = image;

    this.element = document.createElement('div');
    this.buildUI();

    this.state.on('templateSlotChanged', () => this.render());
    this.state.on('metadataChanged', () => this.render());
    this.state.on('activeWangSetChanged', () => this.render());
    this.state.on('templateModeChanged', () => this.render());

    this.render();
  }

  private buildUI(): void {
    // Header
    const header = document.createElement('h3');
    header.textContent = 'Template';
    header.style.cssText = 'margin: 0 0 8px 0; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 1px;';
    this.element.appendChild(header);

    // Color selectors
    const colorRow = document.createElement('div');
    colorRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';

    // Color A
    const colorALabel = document.createElement('label');
    colorALabel.textContent = 'A:';
    colorALabel.style.cssText = 'font-size: 11px; color: #aaa;';
    colorRow.appendChild(colorALabel);

    this.colorASelect = document.createElement('select');
    this.colorASelect.style.cssText = this.selectStyle();
    this.colorASelect.addEventListener('change', () => {
      this.state.setTemplateColorA(parseInt(this.colorASelect.value, 10));
    });
    colorRow.appendChild(this.colorASelect);

    // Color B
    const colorBLabel = document.createElement('label');
    colorBLabel.textContent = 'B:';
    colorBLabel.style.cssText = 'font-size: 11px; color: #aaa;';
    colorRow.appendChild(colorBLabel);

    this.colorBSelect = document.createElement('select');
    this.colorBSelect.style.cssText = this.selectStyle();
    this.colorBSelect.addEventListener('change', () => {
      this.state.setTemplateColorB(parseInt(this.colorBSelect.value, 10));
    });
    colorRow.appendChild(this.colorBSelect);

    this.element.appendChild(colorRow);

    // 4x4 grid
    this.gridContainer = document.createElement('div');
    this.gridContainer.style.cssText = `
      display: grid;
      grid-template-columns: repeat(4, 50px);
      grid-template-rows: repeat(4, 50px);
      gap: 2px;
      margin-bottom: 8px;
    `;
    this.element.appendChild(this.gridContainer);

    // Buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const clearAllBtn = document.createElement('button');
    clearAllBtn.textContent = 'Clear All';
    clearAllBtn.style.cssText = `
      background: #4a2020; color: #ccc; border: 1px solid #633;
      padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 12px;
    `;
    clearAllBtn.addEventListener('click', () => this.clearAll());
    buttonContainer.appendChild(clearAllBtn);

    this.element.appendChild(buttonContainer);
  }

  render(): void {
    this.populateColorSelectors();
    this.rebuildAssignments();
    this.renderGrid();
  }

  /**
   * Populate color A/B dropdowns from the active WangSet's colors.
   */
  private populateColorSelectors(): void {
    const ws = this.state.activeWangSet;
    const colors = ws?.colors ?? [];

    // Preserve current values
    const prevA = this.state.templateColorA;
    const prevB = this.state.templateColorB;

    for (const select of [this.colorASelect, this.colorBSelect]) {
      while (select.firstChild) select.removeChild(select.firstChild);

      for (let i = 0; i < colors.length; i++) {
        const opt = document.createElement('option');
        opt.value = String(i + 1); // 1-based color ID
        opt.textContent = colors[i].name;
        select.appendChild(opt);
      }
    }

    // Clamp selections to valid range
    const maxColorId = colors.length;
    if (prevA < 1 || prevA > maxColorId) this.state.setTemplateColorA(maxColorId >= 1 ? 1 : 0);
    if (prevB < 1 || prevB > maxColorId) this.state.setTemplateColorB(maxColorId >= 2 ? 2 : maxColorId);

    this.colorASelect.value = String(this.state.templateColorA);
    this.colorBSelect.value = String(this.state.templateColorB);
  }

  /**
   * Rebuild slotAssignments from wangtile data by matching wangids
   * against each slot's expected pattern.
   */
  private rebuildAssignments(): void {
    this.slotAssignments.clear();
    const ws = this.state.activeWangSet;
    if (!ws || this.state.templateColorA === 0 || this.state.templateColorB === 0) return;

    for (let slotIndex = 0; slotIndex < 16; slotIndex++) {
      const expected = templateSlotWangId(slotIndex, this.state.templateColorA, this.state.templateColorB);
      const match = ws.wangtiles.find(wt =>
        wt.wangid[1] === expected[1] &&
        wt.wangid[3] === expected[3] &&
        wt.wangid[5] === expected[5] &&
        wt.wangid[7] === expected[7]
      );
      if (match) {
        this.slotAssignments.set(slotIndex, match.tileid);
      }
    }
  }

  /**
   * Render the 4x4 grid of template slot cells.
   */
  private renderGrid(): void {
    while (this.gridContainer.firstChild) {
      this.gridContainer.removeChild(this.gridContainer.firstChild);
    }

    const ws = this.state.activeWangSet;

    for (let slotIndex = 0; slotIndex < 16; slotIndex++) {
      const cell = document.createElement('div');
      const isActive = this.state.activeTemplateSlot === slotIndex;
      cell.style.cssText = `
        position: relative;
        background: #1e1e3a;
        border: 2px solid ${isActive ? '#ffdd00' : '#333'};
        border-radius: 3px;
        cursor: pointer;
        overflow: hidden;
      `;

      // Draw corner color indicators
      this.drawCornerIndicators(cell, slotIndex, ws);

      // Draw tile image if assigned
      const tileId = this.slotAssignments.get(slotIndex);
      if (tileId !== undefined) {
        this.drawTilePreview(cell, tileId);
      }

      // Click: set active template slot
      cell.addEventListener('click', () => {
        this.state.setActiveTemplateSlot(slotIndex);
      });

      // Right-click: clear assignment
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const assignedTileId = this.slotAssignments.get(slotIndex);
        if (assignedTileId !== undefined) {
          this.state.removeWangTile(assignedTileId);
        }
      });

      this.gridContainer.appendChild(cell);
    }
  }

  /**
   * Draw 4 small colored squares in the corners of a cell to show the A/B pattern.
   */
  private drawCornerIndicators(cell: HTMLDivElement, slotIndex: number, ws: WangSetData | undefined): void {
    const slot = TEMPLATE_SLOTS[slotIndex];
    const colors = ws?.colors ?? [];

    const corners: { key: 'tl' | 'tr' | 'br' | 'bl'; top: string; left: string }[] = [
      { key: 'tl', top: '2px', left: '2px' },
      { key: 'tr', top: '2px', left: 'calc(100% - 12px)' },
      { key: 'br', top: 'calc(100% - 12px)', left: 'calc(100% - 12px)' },
      { key: 'bl', top: 'calc(100% - 12px)', left: '2px' },
    ];

    for (const corner of corners) {
      const letter = slot[corner.key]; // 'A' or 'B'
      const colorId = letter === 'A' ? this.state.templateColorA : this.state.templateColorB;
      const colorData = colorId > 0 && colorId <= colors.length ? colors[colorId - 1] : undefined;
      const displayColor = colorData ? colorData.color : '#555';

      const indicator = document.createElement('div');
      indicator.style.cssText = `
        position: absolute;
        top: ${corner.top};
        left: ${corner.left};
        width: 10px;
        height: 10px;
        background: ${displayColor};
        border-radius: 1px;
        pointer-events: none;
        z-index: 1;
      `;
      cell.appendChild(indicator);
    }
  }

  /**
   * Draw a tile image preview in the center of a cell using a canvas.
   */
  private drawTilePreview(cell: HTMLDivElement, tileId: number): void {
    const { tileWidth, tileHeight, columns, tileCount } = this.state.metadata;
    if (tileId < 0 || tileId >= tileCount) return;

    const canvas = document.createElement('canvas');
    canvas.width = tileWidth;
    canvas.height = tileHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const [col, row] = colRowFromTileId(tileId, columns);
    ctx.drawImage(
      this.image,
      col * tileWidth, row * tileHeight, tileWidth, tileHeight,
      0, 0, tileWidth, tileHeight
    );
    canvas.style.cssText = 'width: 100%; height: 100%; image-rendering: pixelated; position: absolute; top: 0; left: 0;';
    cell.appendChild(canvas);
  }

  /**
   * Clear all 16 tile assignments from the active WangSet.
   */
  private clearAll(): void {
    const tileIds = [...this.slotAssignments.values()];
    for (const tileId of tileIds) {
      this.state.removeWangTile(tileId);
    }
  }

  private selectStyle(): string {
    return `
      background: #1e1e3a; color: #e0e0e0; border: 1px solid #555;
      font-size: 11px; padding: 2px 4px; border-radius: 3px;
      flex: 1; cursor: pointer;
    `;
  }

}
