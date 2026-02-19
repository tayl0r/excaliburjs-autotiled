import { EditorState } from '../editor-state.js';
import { ALL_PATTERNS, applyLayoutPattern } from '../layout-patterns.js';
import { computeTileBounds } from '../../utils/tile-math.js';
import { sectionHeader, panelButton, selectInput, SELECT_STYLE } from '../dom-helpers.js';
import type { WangSetData } from '../../core/metadata-schema.js';

/**
 * Panel that appears in the right sidebar when multiple tiles are selected.
 * Allows auto-assigning WangIds to a rectangular region based on a layout pattern.
 */
export class RegionAssignPanel {
  readonly element: HTMLDivElement;
  private state: EditorState;

  constructor(state: EditorState) {
    this.state = state;
    this.element = document.createElement('div');

    this.state.on('selectedTileChanged', () => this.render());
    this.state.on('metadataChanged', () => this.render());
    this.state.on('activeWangSetChanged', () => this.render());
    this.state.on('clipboardChanged', () => this.render());
    this.state.on('templateModeChanged', () => this.render());

    this.render();
  }

  render(): void {
    this.element.replaceChildren();

    const selectedIds = this.state.selectedTileIds;
    if (selectedIds.size <= 1) {
      this.element.style.display = 'none';
      return;
    }
    this.element.style.display = 'block';

    // Calculate selection bounds
    const columns = this.state.columns;
    const { minCol, maxCol, minRow, maxRow } = computeTileBounds(selectedIds, columns);
    const regionW = maxCol - minCol + 1;
    const regionH = maxRow - minRow + 1;

    this.element.appendChild(sectionHeader('Region Assign', 'margin-top: 12px;'));

    // Selection info
    const info = document.createElement('div');
    info.textContent = `Selected: ${regionW}\u00D7${regionH} region (${selectedIds.size} tiles)`;
    info.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 8px;';
    this.element.appendChild(info);

    const ws = this.state.activeWangSet;
    if (!ws || ws.colors.length < 2) {
      const noColors = document.createElement('div');
      noColors.textContent = 'Need 2+ colors in active WangSet';
      noColors.style.cssText = 'font-size: 11px; color: #666; font-style: italic;';
      this.element.appendChild(noColors);
      return;
    }

    // Color A/B selects
    this.element.appendChild(this.createColorSelect('Color A:', 'colorA', this.state.templateColorA, ws));
    this.element.appendChild(this.createColorSelect('Color B:', 'colorB', this.state.templateColorB, ws));

    // Pattern select
    const hasMatch = ALL_PATTERNS.some(p => p.width === regionW && p.height === regionH);
    this.element.appendChild(this.createPatternSelect(regionW, regionH));

    // Apply button
    const applyBtn = panelButton('Apply Pattern');
    applyBtn.disabled = !hasMatch;
    applyBtn.style.cssText += `
      width: 100%;
      padding: 6px 12px; font-size: 12px;
      color: ${hasMatch ? '#ccc' : '#666'};
      cursor: ${hasMatch ? 'pointer' : 'not-allowed'};
    `;
    applyBtn.addEventListener('click', () => {
      const { colorA, colorB } = this.readColorSelections();
      const patternSelect = this.element.querySelector('[data-role="pattern"]') as HTMLSelectElement;
      const pattern = ALL_PATTERNS.find(p => p.name === patternSelect?.value);
      if (!pattern) return;

      const originTileId = minRow * columns + minCol;
      const assignments = applyLayoutPattern(
        pattern, originTileId, columns, this.state.tileCount, colorA, colorB
      );
      this.state.setWangIdMulti(assignments.map(([tileId, wangid]) => ({ tileId, wangid })));
    });
    this.element.appendChild(applyBtn);

    // Copy/Paste buttons
    this.element.appendChild(this.createCopyPasteRow(regionW, regionH));
  }

  private readColorSelections(): { colorA: number; colorB: number } {
    const colorASelect = this.element.querySelector('[data-role="colorA"]') as HTMLSelectElement;
    const colorBSelect = this.element.querySelector('[data-role="colorB"]') as HTMLSelectElement;
    return {
      colorA: parseInt(colorASelect?.value ?? '1', 10),
      colorB: parseInt(colorBSelect?.value ?? '2', 10),
    };
  }

  private createColorSelect(
    label: string,
    role: string,
    defaultColorId: number,
    ws: WangSetData,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 6px; align-items: center; margin-bottom: 6px;';

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = 'font-size: 11px; color: #aaa; min-width: 50px;';
    row.appendChild(lbl);

    const items = ws.colors.map((c, i) => ({ value: String(i + 1), text: c.name }));
    const selected = String(Math.min(defaultColorId, ws.colors.length));
    const select = selectInput(items, selected, SELECT_STYLE + '; flex: 1;');
    select.dataset.role = role;
    select.addEventListener('change', () => {
      const val = parseInt(select.value, 10);
      if (role === 'colorA') this.state.setTemplateColorA(val);
      else this.state.setTemplateColorB(val);
    });
    row.appendChild(select);

    return row;
  }

  private createPatternSelect(regionW: number, regionH: number): HTMLDivElement {
    const patternRow = document.createElement('div');
    patternRow.style.cssText = 'display: flex; gap: 6px; align-items: center; margin-bottom: 8px;';

    const patternLabel = document.createElement('span');
    patternLabel.textContent = 'Pattern:';
    patternLabel.style.cssText = 'font-size: 11px; color: #aaa; min-width: 50px;';
    patternRow.appendChild(patternLabel);

    let firstMatchValue = '';
    const items = ALL_PATTERNS.map(p => {
      const matches = p.width === regionW && p.height === regionH;
      if (matches && !firstMatchValue) firstMatchValue = p.name;
      return {
        value: p.name,
        text: `${p.name} (${p.width}\u00D7${p.height})`,
        disabled: !matches,
      };
    });

    const select = selectInput(items, firstMatchValue, SELECT_STYLE + '; flex: 1;');
    select.dataset.role = 'pattern';
    patternRow.appendChild(select);

    return patternRow;
  }

  private createCopyPasteRow(regionW: number, regionH: number): HTMLDivElement {
    const clip = this.state.wangClipboard;
    const canPaste = clip != null && clip.width === regionW && clip.height === regionH;

    const copyPasteRow = document.createElement('div');
    copyPasteRow.style.cssText = 'display: flex; gap: 6px; margin-top: 6px;';

    const copyBtn = panelButton('Copy');
    copyBtn.style.cssText += 'padding: 6px 12px; font-size: 12px; flex: 1;';
    copyBtn.addEventListener('click', () => {
      this.state.copyWangRegion();
    });
    copyPasteRow.appendChild(copyBtn);

    const pasteBtn = panelButton(clip ? `Paste (${clip.width}\u00D7${clip.height})` : 'Paste');
    pasteBtn.disabled = !canPaste;
    pasteBtn.style.cssText += `
      padding: 6px 12px; font-size: 12px; flex: 1;
      color: ${canPaste ? '#ccc' : '#666'};
      cursor: ${canPaste ? 'pointer' : 'not-allowed'};
    `;
    pasteBtn.addEventListener('click', () => {
      if (!canPaste) return;
      const { colorA, colorB } = this.readColorSelections();
      this.state.pasteWangRegion(colorA, colorB);
    });
    copyPasteRow.appendChild(pasteBtn);

    return copyPasteRow;
  }
}
