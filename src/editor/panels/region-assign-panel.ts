import { EditorState } from '../editor-state.js';
import { ALL_PATTERNS, applyLayoutPattern } from '../layout-patterns.js';
import { computeTileBounds } from '../../utils/tile-math.js';
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

    // Header
    const header = document.createElement('h3');
    header.textContent = 'Region Assign';
    header.style.cssText = 'margin: 12px 0 8px 0; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 1px;';
    this.element.appendChild(header);

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

    // Color A/B selects — persisted via state.templateColorA/B
    const colorARow = this.createColorSelect('Color A:', this.state.templateColorA, ws);
    this.element.appendChild(colorARow);

    const colorBRow = this.createColorSelect('Color B:', this.state.templateColorB, ws);
    this.element.appendChild(colorBRow);

    // Pattern select — all patterns shown, non-matching ones disabled
    const patternRow = document.createElement('div');
    patternRow.style.cssText = 'display: flex; gap: 6px; align-items: center; margin-bottom: 8px;';
    const patternLabel = document.createElement('span');
    patternLabel.textContent = 'Pattern:';
    patternLabel.style.cssText = 'font-size: 11px; color: #aaa; min-width: 50px;';
    patternRow.appendChild(patternLabel);

    const patternSelect = document.createElement('select');
    patternSelect.style.cssText = 'background: #1e1e3a; color: #e0e0e0; border: 1px solid #555; font-size: 11px; padding: 2px 4px; border-radius: 3px; flex: 1;';
    let firstMatch = true;
    for (const pattern of ALL_PATTERNS) {
      const matches = pattern.width === regionW && pattern.height === regionH;
      const opt = document.createElement('option');
      opt.value = pattern.name;
      opt.textContent = `${pattern.name} (${pattern.width}\u00D7${pattern.height})`;
      opt.disabled = !matches;
      if (matches && firstMatch) {
        opt.selected = true;
        firstMatch = false;
      }
      patternSelect.appendChild(opt);
    }
    patternRow.appendChild(patternSelect);
    this.element.appendChild(patternRow);

    // Apply button
    const hasMatch = ALL_PATTERNS.some(p => p.width === regionW && p.height === regionH);
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply Pattern';
    applyBtn.disabled = !hasMatch;
    applyBtn.style.cssText = `background: #333; color: ${hasMatch ? '#ccc' : '#666'}; border: 1px solid #555; padding: 6px 12px; border-radius: 3px; cursor: ${hasMatch ? 'pointer' : 'not-allowed'}; font-size: 12px; width: 100%;`;
    applyBtn.addEventListener('click', () => {
      const colorASelect = this.element.querySelector('[data-role="colorA"]') as HTMLSelectElement;
      const colorBSelect = this.element.querySelector('[data-role="colorB"]') as HTMLSelectElement;
      const colorA = parseInt(colorASelect?.value ?? '1', 10);
      const colorB = parseInt(colorBSelect?.value ?? '2', 10);

      const patternName = patternSelect.value;
      const pattern = ALL_PATTERNS.find(p => p.name === patternName);
      if (!pattern) return;

      // Origin = top-left of selection
      const originTileId = minRow * columns + minCol;
      const assignments = applyLayoutPattern(
        pattern, originTileId, columns, this.state.tileCount, colorA, colorB
      );

      this.state.setWangIdMulti(assignments.map(([tileId, wangid]) => ({ tileId, wangid })));
    });
    this.element.appendChild(applyBtn);

    // Copy/Paste buttons
    const clip = this.state.wangClipboard;
    const canPaste = clip != null && clip.width === regionW && clip.height === regionH;

    const copyPasteRow = document.createElement('div');
    copyPasteRow.style.cssText = 'display: flex; gap: 6px; margin-top: 6px;';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.style.cssText = 'background: #333; color: #ccc; border: 1px solid #555; padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 12px; flex: 1;';
    copyBtn.addEventListener('click', () => {
      this.state.copyWangRegion();
    });
    copyPasteRow.appendChild(copyBtn);

    const pasteBtn = document.createElement('button');
    pasteBtn.textContent = clip ? `Paste (${clip.width}\u00D7${clip.height})` : 'Paste';
    pasteBtn.disabled = !canPaste;
    pasteBtn.style.cssText = `background: #333; color: ${canPaste ? '#ccc' : '#666'}; border: 1px solid #555; padding: 6px 12px; border-radius: 3px; cursor: ${canPaste ? 'pointer' : 'not-allowed'}; font-size: 12px; flex: 1;`;
    pasteBtn.addEventListener('click', () => {
      if (!canPaste) return;
      const colorASelect = this.element.querySelector('[data-role="colorA"]') as HTMLSelectElement;
      const colorBSelect = this.element.querySelector('[data-role="colorB"]') as HTMLSelectElement;
      const colorA = parseInt(colorASelect?.value ?? '1', 10);
      const colorB = parseInt(colorBSelect?.value ?? '2', 10);
      this.state.pasteWangRegion(colorA, colorB);
    });
    copyPasteRow.appendChild(pasteBtn);

    this.element.appendChild(copyPasteRow);
  }

  private createColorSelect(label: string, defaultColorId: number, ws: WangSetData): HTMLDivElement {
    const role = label.includes('A') ? 'colorA' : 'colorB';

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 6px; align-items: center; margin-bottom: 6px;';

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = 'font-size: 11px; color: #aaa; min-width: 50px;';
    row.appendChild(lbl);

    const select = document.createElement('select');
    select.dataset.role = role;
    select.style.cssText = 'background: #1e1e3a; color: #e0e0e0; border: 1px solid #555; font-size: 11px; padding: 2px 4px; border-radius: 3px; flex: 1;';

    for (let i = 0; i < ws.colors.length; i++) {
      const opt = document.createElement('option');
      opt.value = String(i + 1);
      opt.textContent = ws.colors[i].name;
      select.appendChild(opt);
    }
    select.value = String(Math.min(defaultColorId, ws.colors.length));
    select.addEventListener('change', () => {
      const val = parseInt(select.value, 10);
      if (role === 'colorA') this.state.setTemplateColorA(val);
      else this.state.setTemplateColorB(val);
    });
    row.appendChild(select);

    return row;
  }
}
