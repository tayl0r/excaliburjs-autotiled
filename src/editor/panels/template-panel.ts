import { EditorState } from '../editor-state.js';
import { TEMPLATE_SLOTS, templateSlotWangId } from '../template-utils.js';
import { colRowFromTileId } from '../../utils/tile-math.js';
import { wangColorHex } from '../../core/wang-color.js';
import { sectionHeader, panelButton, selectInput, DANGER_BTN_STYLE, SELECT_STYLE } from '../dom-helpers.js';
import type { WangSetData } from '../../core/metadata-schema.js';

/**
 * Template panel for batch-tagging tiles using a 4x4 grid of Wang corner combinations.
 * Each cell represents one of the 16 possible A/B corner patterns.
 * Supports color selection, auto-fill from a selected tile origin, and clear all.
 */
export class TemplatePanel {
  readonly element: HTMLDivElement;
  private state: EditorState;
  private images: HTMLImageElement[];

  /** Local mapping: slotIndex -> tileId */
  private slotAssignments = new Map<number, number>();

  private colorASelect!: HTMLSelectElement;
  private colorBSelect!: HTMLSelectElement;
  private gridContainer!: HTMLDivElement;

  constructor(state: EditorState, images: HTMLImageElement[]) {
    this.state = state;
    this.images = images;

    this.element = document.createElement('div');
    this.buildUI();

    this.state.on('templateSlotChanged', () => this.render());
    this.state.on('metadataChanged', () => this.render());
    this.state.on('activeWangSetChanged', () => this.render());
    this.state.on('templateModeChanged', () => this.render());

    this.render();
  }

  private buildUI(): void {
    this.element.appendChild(sectionHeader('Template'));

    // Color selectors
    const colorRow = document.createElement('div');
    colorRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';

    // Color A
    const colorALabel = document.createElement('label');
    colorALabel.textContent = 'A:';
    colorALabel.style.cssText = 'font-size: 11px; color: #aaa;';
    colorRow.appendChild(colorALabel);

    this.colorASelect = document.createElement('select');
    this.colorASelect.style.cssText = SELECT_STYLE + '; flex: 1; cursor: pointer;';
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
    this.colorBSelect.style.cssText = SELECT_STYLE + '; flex: 1; cursor: pointer;';
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

    // Clear All button
    const clearAllBtn = panelButton('Clear All', DANGER_BTN_STYLE);
    clearAllBtn.addEventListener('click', () => this.clearAll());
    this.element.appendChild(clearAllBtn);
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

    const prevA = this.state.templateColorA;
    const prevB = this.state.templateColorB;

    const options = colors.map((c, i) => ({
      value: String(i + 1),
      text: c.name,
    }));

    for (const select of [this.colorASelect, this.colorBSelect]) {
      select.replaceChildren();
      for (const item of options) {
        const opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.text;
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

  private renderGrid(): void {
    this.gridContainer.replaceChildren();

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

      this.drawCornerIndicators(cell, slotIndex, ws);

      const tileId = this.slotAssignments.get(slotIndex);
      if (tileId !== undefined) {
        this.drawTilePreview(cell, tileId);
      }

      cell.addEventListener('click', () => {
        this.state.setActiveTemplateSlot(slotIndex);
      });

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

    const corners: { key: 'tl' | 'tr' | 'br' | 'bl'; top: string; left: string }[] = [
      { key: 'tl', top: '2px', left: '2px' },
      { key: 'tr', top: '2px', left: 'calc(100% - 12px)' },
      { key: 'br', top: 'calc(100% - 12px)', left: 'calc(100% - 12px)' },
      { key: 'bl', top: 'calc(100% - 12px)', left: '2px' },
    ];

    for (const corner of corners) {
      const letter = slot[corner.key];
      const colorId = letter === 'A' ? this.state.templateColorA : this.state.templateColorB;
      const displayColor = colorId > 0 ? wangColorHex(colorId) : '#555';

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

  private drawTilePreview(cell: HTMLDivElement, tileId: number): void {
    const { tileWidth, tileHeight, columns, tileCount } = this.state;
    if (tileId < 0 || tileId >= tileCount) return;

    const canvas = document.createElement('canvas');
    canvas.width = tileWidth;
    canvas.height = tileHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const [col, row] = colRowFromTileId(tileId, columns);
    ctx.drawImage(
      this.images[this.state.activeTilesetIndex],
      col * tileWidth, row * tileHeight, tileWidth, tileHeight,
      0, 0, tileWidth, tileHeight
    );
    canvas.style.cssText = 'width: 100%; height: 100%; image-rendering: pixelated; position: absolute; top: 0; left: 0;';
    cell.appendChild(canvas);
  }

  private clearAll(): void {
    const tileIds = [...this.slotAssignments.values()];
    if (tileIds.length > 0) {
      this.state.removeWangTileMulti(tileIds);
    }
  }
}
