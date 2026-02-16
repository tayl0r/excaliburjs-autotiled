import { EditorState } from '../editor-state.js';

/**
 * WangSet and color management panel.
 * Shows the list of WangSets, their colors, and allows selecting the active color
 * for WangId zone painting in the inspector.
 */
export class WangSetPanel {
  readonly element: HTMLDivElement;
  private state: EditorState;
  private listContainer!: HTMLDivElement;

  constructor(state: EditorState) {
    this.state = state;

    this.element = document.createElement('div');

    const header = document.createElement('h3');
    header.textContent = 'WangSets';
    header.style.cssText = 'margin: 0 0 8px 0; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 1px;';
    this.element.appendChild(header);

    this.listContainer = document.createElement('div');
    this.element.appendChild(this.listContainer);

    this.state.on('activeWangSetChanged', () => this.render());
    this.state.on('activeColorChanged', () => this.render());
    this.state.on('metadataChanged', () => this.render());

    this.render();
  }

  render(): void {
    // Clear existing content
    while (this.listContainer.firstChild) {
      this.listContainer.removeChild(this.listContainer.firstChild);
    }

    const { wangsets } = this.state.metadata;

    if (wangsets.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No WangSets defined.';
      empty.style.cssText = 'color: #666; font-style: italic; padding: 8px 0;';
      this.listContainer.appendChild(empty);
      return;
    }

    wangsets.forEach((ws, wsIndex) => {
      const wsDiv = document.createElement('div');
      wsDiv.style.cssText = `
        margin-bottom: 12px;
        background: ${wsIndex === this.state.activeWangSetIndex ? '#2a2a5a' : 'transparent'};
        border-radius: 4px;
        padding: 6px;
      `;

      // WangSet header
      const wsHeader = document.createElement('div');
      wsHeader.style.cssText = `
        display: flex; align-items: center; gap: 6px;
        cursor: pointer; padding: 4px 0;
        font-weight: ${wsIndex === this.state.activeWangSetIndex ? '600' : '400'};
      `;
      wsHeader.addEventListener('click', () => {
        this.state.setActiveWangSet(wsIndex);
      });

      const wsName = document.createElement('span');
      wsName.textContent = ws.name;
      wsName.style.flex = '1';
      wsHeader.appendChild(wsName);

      const wsType = document.createElement('span');
      wsType.textContent = ws.type;
      wsType.style.cssText = 'font-size: 10px; color: #888; background: #333; padding: 1px 6px; border-radius: 3px;';
      wsHeader.appendChild(wsType);

      const tileCount = document.createElement('span');
      tileCount.textContent = `${ws.wangtiles.length} tiles`;
      tileCount.style.cssText = 'font-size: 10px; color: #888;';
      wsHeader.appendChild(tileCount);

      wsDiv.appendChild(wsHeader);

      // Colors list (only show for active WangSet)
      if (wsIndex === this.state.activeWangSetIndex) {
        const colorsList = document.createElement('div');
        colorsList.style.cssText = 'margin-top: 4px; padding-left: 4px;';

        // Color 0 = "Erase" option
        const eraseRow = this.createColorRow(0, 'Erase', '#333', '0');
        colorsList.appendChild(eraseRow);

        ws.colors.forEach((color, ci) => {
          const colorId = ci + 1; // 1-based
          const row = this.createColorRow(colorId, color.name, color.color, String(colorId));
          colorsList.appendChild(row);
        });

        wsDiv.appendChild(colorsList);
      }

      this.listContainer.appendChild(wsDiv);
    });

    // Keyboard hint
    const hint = document.createElement('div');
    hint.textContent = 'Keys 0-9: select color';
    hint.style.cssText = 'color: #555; font-size: 11px; margin-top: 12px; padding: 4px;';
    this.listContainer.appendChild(hint);
  }

  private createColorRow(colorId: number, name: string, hexColor: string, shortcut: string): HTMLDivElement {
    const row = document.createElement('div');
    const isActive = colorId === this.state.activeColorId;
    row.style.cssText = `
      display: flex; align-items: center; gap: 6px;
      padding: 3px 6px; margin: 2px 0;
      cursor: pointer; border-radius: 3px;
      background: ${isActive ? '#3a3a6a' : 'transparent'};
      border: 1px solid ${isActive ? '#6666cc' : 'transparent'};
    `;
    row.addEventListener('click', () => {
      this.state.setActiveColor(colorId);
    });

    const swatch = document.createElement('div');
    swatch.style.cssText = `
      width: 14px; height: 14px; border-radius: 2px;
      background: ${hexColor};
      border: 1px solid rgba(255,255,255,0.3);
      flex-shrink: 0;
    `;
    row.appendChild(swatch);

    const label = document.createElement('span');
    label.textContent = name;
    label.style.cssText = 'flex: 1; font-size: 12px;';
    row.appendChild(label);

    const key = document.createElement('span');
    key.textContent = shortcut;
    key.style.cssText = `
      font-size: 10px; color: #666;
      background: #2a2a2a; padding: 0 4px;
      border-radius: 2px; border: 1px solid #444;
    `;
    row.appendChild(key);

    return row;
  }
}
