import { EditorState } from '../editor-state.js';
import { checkCompleteness } from '../completeness-checker.js';
import type { WangSetData } from '../../core/metadata-schema.js';

/**
 * WangSet and color management panel.
 * Shows the list of WangSets, their colors, and allows selecting the active color
 * for WangId zone painting in the inspector.
 *
 * Supports full CRUD for WangSets and WangColors, plus completeness status display.
 */
export class WangSetPanel {
  readonly element: HTMLDivElement;
  private state: EditorState;
  private image: HTMLImageElement;
  private listContainer!: HTMLDivElement;
  /** Track whether the completeness missing-list is expanded */
  private missingExpanded = false;
  /** Suppress re-renders while color picker popup is open */
  private colorPickerOpen = false;

  constructor(state: EditorState, image: HTMLImageElement) {
    this.state = state;
    this.image = image;

    this.element = document.createElement('div');

    const header = document.createElement('h3');
    header.textContent = 'WangSets';
    header.style.cssText = 'margin: 0 0 8px 0; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 1px;';
    this.element.appendChild(header);

    this.listContainer = document.createElement('div');
    this.element.appendChild(this.listContainer);

    this.state.on('activeWangSetChanged', () => {
      this.missingExpanded = false;
      this.render();
    });
    this.state.on('activeColorChanged', () => this.render());
    this.state.on('metadataChanged', () => this.render());
    this.state.on('selectedTileChanged', () => this.render());

    this.render();
  }

  render(): void {
    if (this.colorPickerOpen) return;

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
    } else {
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

        // WangSet name (supports inline rename on dblclick)
        const wsName = document.createElement('span');
        wsName.textContent = ws.name;
        wsName.style.flex = '1';
        wsName.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          this.startInlineRenameWangSet(wsName, wsIndex);
        });
        wsHeader.appendChild(wsName);

        const wsType = document.createElement('span');
        wsType.textContent = ws.type;
        wsType.style.cssText = 'font-size: 10px; color: #888; background: #333; padding: 1px 6px; border-radius: 3px;';
        wsHeader.appendChild(wsType);

        const tileCount = document.createElement('span');
        tileCount.textContent = `${ws.wangtiles.length} tiles`;
        tileCount.style.cssText = 'font-size: 10px; color: #888;';
        wsHeader.appendChild(tileCount);

        // Delete WangSet button
        const deleteWsBtn = document.createElement('button');
        deleteWsBtn.textContent = '\u00d7';
        deleteWsBtn.title = `Delete WangSet "${ws.name}"`;
        deleteWsBtn.style.cssText = `
          background: #333; color: #ccc; border: none; cursor: pointer;
          font-size: 14px; line-height: 1; padding: 2px 6px;
          border-radius: 3px;
        `;
        deleteWsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Delete WangSet "${ws.name}"?`)) {
            this.state.removeWangSet(wsIndex);
          }
        });
        wsHeader.appendChild(deleteWsBtn);

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
            const row = this.createColorRow(colorId, color.name, color.color, String(colorId), ci);
            colorsList.appendChild(row);
          });

          // "+ Add Color" button
          const addColorBtn = document.createElement('button');
          addColorBtn.textContent = '+ Add Color';
          addColorBtn.style.cssText = `
            background: #333; color: #ccc; border: 1px solid #555;
            cursor: pointer; font-size: 11px; padding: 4px 10px;
            border-radius: 3px; margin-top: 6px; width: 100%;
          `;
          addColorBtn.addEventListener('click', () => {
            const n = ws.colors.length + 1;
            const name = `Color ${n}`;
            const hue = (ws.colors.length * 137) % 360; // golden-angle rotation
            const hexColor = this.hslToHex(hue, 70, 50);
            this.state.addColor(name, hexColor);
          });
          colorsList.appendChild(addColorBtn);

          // "Set Rep Tile" button — assigns selected tile as representative for active color
          const setRepBtn = document.createElement('button');
          setRepBtn.textContent = 'Set Rep Tile';
          const activeColor = this.state.activeColorId;
          const hasSelection = this.state.selectedTileId >= 0;
          const hasActiveColor = activeColor >= 1;
          setRepBtn.disabled = !hasSelection || !hasActiveColor;
          setRepBtn.title = hasSelection && hasActiveColor
            ? `Set tile #${this.state.selectedTileId} as representative for active color`
            : 'Select a tile and a color first';
          setRepBtn.style.cssText = `
            background: #333; color: ${setRepBtn.disabled ? '#666' : '#ccc'};
            border: 1px solid #555;
            cursor: ${setRepBtn.disabled ? 'not-allowed' : 'pointer'};
            font-size: 11px; padding: 4px 10px;
            border-radius: 3px; margin-top: 4px; width: 100%;
          `;
          setRepBtn.addEventListener('click', () => {
            if (this.state.selectedTileId >= 0 && this.state.activeColorId >= 1) {
              const ci = this.state.activeColorId - 1; // 0-based index
              this.state.updateColor(ci, { tile: this.state.selectedTileId });
            }
          });
          colorsList.appendChild(setRepBtn);

          wsDiv.appendChild(colorsList);

          // Completeness status display
          if (ws.colors.length > 0) {
            const completenessDiv = this.createCompletenessDisplay(ws);
            wsDiv.appendChild(completenessDiv);
          }
        }

        this.listContainer.appendChild(wsDiv);
      });
    }

    // "+ New WangSet" button
    const addWsBtn = document.createElement('button');
    addWsBtn.textContent = '+ New WangSet';
    addWsBtn.style.cssText = `
      background: #333; color: #ccc; border: 1px solid #555;
      cursor: pointer; font-size: 11px; padding: 4px 10px;
      border-radius: 3px; margin-top: 8px; width: 100%;
    `;
    addWsBtn.addEventListener('click', () => {
      const n = wangsets.length + 1;
      this.state.addWangSet(`WangSet ${n}`, 'corner');
    });
    this.listContainer.appendChild(addWsBtn);

    // Transformations section
    this.listContainer.appendChild(this.createTransformationsSection());

    // Keyboard hint
    const hint = document.createElement('div');
    hint.textContent = 'Keys 0-9: select color';
    hint.style.cssText = 'color: #555; font-size: 11px; margin-top: 12px; padding: 4px;';
    this.listContainer.appendChild(hint);
  }

  /**
   * Replace a WangSet name span with an inline text input for renaming.
   */
  private startInlineRenameWangSet(span: HTMLSpanElement, wsIndex: number): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.state.metadata.wangsets[wsIndex].name;
    input.style.cssText = `
      flex: 1; background: #1e1e3a; color: #e0e0e0; border: 1px solid #6666cc;
      font-size: 12px; padding: 1px 4px; border-radius: 2px; outline: none;
    `;

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const newName = input.value.trim();
      if (newName && newName !== this.state.metadata.wangsets[wsIndex]?.name) {
        this.state.renameWangSet(wsIndex, newName);
      }
      this.render();
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        committed = true;
        this.render();
      }
    });
    input.addEventListener('blur', commit);

    span.replaceWith(input);
    input.focus();
    input.select();
  }

  /**
   * Replace a color name label with an inline text input for renaming.
   */
  private startInlineRenameColor(span: HTMLSpanElement, colorIndex: number): void {
    const ws = this.state.activeWangSet;
    if (!ws) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = ws.colors[colorIndex].name;
    input.style.cssText = `
      flex: 1; background: #1e1e3a; color: #e0e0e0; border: 1px solid #6666cc;
      font-size: 12px; padding: 1px 4px; border-radius: 2px; outline: none;
    `;

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const newName = input.value.trim();
      if (newName && newName !== ws.colors[colorIndex]?.name) {
        this.state.updateColor(colorIndex, { name: newName });
      }
      this.render();
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        committed = true;
        this.render();
      }
    });
    input.addEventListener('blur', commit);

    span.replaceWith(input);
    input.focus();
    input.select();
  }

  /**
   * Replace a probability badge with an inline number input.
   */
  private startInlineProbabilityEdit(badge: HTMLSpanElement, colorIndex: number): void {
    const ws = this.state.activeWangSet;
    if (!ws) return;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '1';
    input.step = '0.1';
    input.value = String(ws.colors[colorIndex].probability);
    input.style.cssText = `
      width: 48px; background: #1e1e3a; color: #e0e0e0; border: 1px solid #6666cc;
      font-size: 11px; padding: 1px 4px; border-radius: 2px; outline: none;
    `;

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const val = parseFloat(input.value);
      if (!isNaN(val) && val >= 0 && val <= 1) {
        this.state.updateColor(colorIndex, { probability: val });
      }
      this.render();
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        committed = true;
        this.render();
      }
    });
    input.addEventListener('blur', commit);

    badge.replaceWith(input);
    input.focus();
    input.select();
  }

  /**
   * Create a color row. When colorIndex is provided (for real colors, not erase),
   * enables inline rename, color picker, and delete.
   */
  private createColorRow(
    colorId: number,
    name: string,
    hexColor: string,
    shortcut: string,
    colorIndex?: number,
  ): HTMLDivElement {
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

    // Representative tile thumbnail (for real colors)
    if (colorIndex !== undefined) {
      const ws = this.state.activeWangSet;
      const repTile = ws?.colors[colorIndex]?.tile ?? -1;
      const thumb = document.createElement('canvas');
      thumb.width = 14;
      thumb.height = 14;
      thumb.style.cssText = `
        width: 14px; height: 14px; flex-shrink: 0;
        border-radius: 2px;
        ${repTile === -1
          ? 'border: 1px dashed rgba(255,255,255,0.2);'
          : 'border: 1px solid rgba(255,255,255,0.3);'}
      `;

      if (repTile >= 0) {
        const ctx = thumb.getContext('2d');
        if (ctx) {
          const { tileWidth, tileHeight, columns } = this.state.metadata;
          const sx = (repTile % columns) * tileWidth;
          const sy = Math.floor(repTile / columns) * tileHeight;
          ctx.drawImage(this.image, sx, sy, tileWidth, tileHeight, 0, 0, 14, 14);
        }
        thumb.title = `Representative tile #${repTile} (right-click to clear)`;
        thumb.style.cursor = 'pointer';
        thumb.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.state.updateColor(colorIndex!, { tile: -1 });
        });
      } else {
        thumb.title = 'No representative tile set';
      }

      row.appendChild(thumb);
    }

    // Color swatch — clickable to open a color picker for real colors
    const swatch = document.createElement('div');
    swatch.style.cssText = `
      width: 14px; height: 14px; border-radius: 2px;
      background: ${hexColor};
      border: 1px solid rgba(255,255,255,0.3);
      flex-shrink: 0;
    `;

    if (colorIndex !== undefined) {
      swatch.style.cursor = 'pointer';
      swatch.title = 'Click to change color';
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();

        this.colorPickerOpen = true;
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = hexColor;
        picker.style.cssText = 'position: absolute; opacity: 0; pointer-events: none;';
        picker.addEventListener('input', () => {
          swatch.style.background = picker.value;
          this.state.updateColor(colorIndex, { color: picker.value });
        });
        picker.addEventListener('change', () => {
          this.state.updateColor(colorIndex, { color: picker.value });
          picker.remove();
          this.colorPickerOpen = false;
          this.render();
        });
        row.appendChild(picker);
        picker.click();
      });
    }
    row.appendChild(swatch);

    // Name label (supports inline rename for real colors on dblclick)
    const label = document.createElement('span');
    label.textContent = name;
    label.style.cssText = 'flex: 1; font-size: 12px;';

    if (colorIndex !== undefined) {
      label.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startInlineRenameColor(label, colorIndex);
      });
    }
    row.appendChild(label);

    // Probability badge (for real colors) — click to expand to inline input
    if (colorIndex !== undefined) {
      const ws = this.state.activeWangSet;
      const prob = ws?.colors[colorIndex]?.probability ?? 1.0;
      const probBadge = document.createElement('span');
      probBadge.textContent = `P:${parseFloat(prob.toFixed(2))}`;
      const isDefault = prob === 1.0;
      probBadge.style.cssText = `
        font-size: 10px; color: ${isDefault ? '#888' : '#eeb300'};
        background: #2a2a2a; padding: 0 4px;
        border-radius: 2px; border: 1px solid ${isDefault ? '#444' : '#887700'};
        cursor: pointer; user-select: none;
      `;
      probBadge.title = 'Click to edit probability';
      probBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startInlineProbabilityEdit(probBadge, colorIndex!);
      });
      row.appendChild(probBadge);
    }

    // Keyboard shortcut badge
    const key = document.createElement('span');
    key.textContent = shortcut;
    key.style.cssText = `
      font-size: 10px; color: #666;
      background: #2a2a2a; padding: 0 4px;
      border-radius: 2px; border: 1px solid #444;
    `;
    row.appendChild(key);

    // Delete button for real colors
    if (colorIndex !== undefined) {
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '\u00d7';
      deleteBtn.title = `Delete color "${name}"`;
      deleteBtn.style.cssText = `
        background: #333; color: #ccc; border: none; cursor: pointer;
        font-size: 12px; line-height: 1; padding: 1px 5px;
        border-radius: 3px;
      `;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete color "${name}"? This clears it from all tagged tiles.`)) {
          this.state.removeColor(colorIndex);
        }
      });
      row.appendChild(deleteBtn);
    }

    return row;
  }

  /**
   * Create the Transformations configuration section.
   * Provides checkboxes for flip/rotate options and an impact display
   * showing base tile count and effective variant multiplier.
   */
  private createTransformationsSection(): HTMLDivElement {
    const section = document.createElement('div');
    section.style.cssText = 'margin-top: 16px;';

    const header = document.createElement('h3');
    header.textContent = 'Transformations';
    header.style.cssText = 'margin: 0 0 8px 0; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 1px;';
    section.appendChild(header);

    const config = this.state.transformations;

    const checkboxes: { label: string; key: keyof typeof config }[] = [
      { label: 'Allow Flip H', key: 'allowFlipH' },
      { label: 'Allow Flip V', key: 'allowFlipV' },
      { label: 'Allow Rotation', key: 'allowRotate' },
      { label: 'Prefer Untransformed', key: 'preferUntransformed' },
    ];

    for (const cb of checkboxes) {
      const labelEl = document.createElement('label');
      labelEl.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; cursor: pointer;';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = config[cb.key];
      input.addEventListener('change', () => {
        this.state.setTransformations({ [cb.key]: input.checked });
      });
      labelEl.appendChild(input);

      const span = document.createElement('span');
      span.textContent = cb.label;
      labelEl.appendChild(span);

      section.appendChild(labelEl);
    }

    // Impact display
    const { wangsets } = this.state.metadata;
    let baseTiles = 0;
    for (const ws of wangsets) {
      baseTiles += ws.wangtiles.length;
    }

    let multiplier = 1;
    if (config.allowFlipH) multiplier *= 2;
    if (config.allowFlipV) multiplier *= 2;
    if (config.allowRotate) multiplier *= 4;
    // When all three are enabled the theoretical max is 8 (not 16),
    // because some flip+rotate combinations are equivalent.
    // The combined product 2*2*4=16 overcounts; cap at 8.
    if (multiplier > 8) multiplier = 8;

    const impact = document.createElement('div');
    impact.style.cssText = 'font-size: 11px; color: #888; margin-top: 6px; padding: 4px;';
    if (baseTiles > 0) {
      const effective = baseTiles * multiplier;
      impact.textContent = `${baseTiles} base tiles \u2192 up to ${effective} effective variants (${multiplier}x)`;
    } else {
      impact.textContent = 'No base tiles defined yet';
    }
    section.appendChild(impact);

    return section;
  }

  /**
   * Create the completeness status display for a WangSet.
   * Shows matched/total count and an expandable list of missing combinations.
   */
  private createCompletenessDisplay(ws: WangSetData): HTMLDivElement {
    const result = checkCompleteness(ws);
    const container = document.createElement('div');
    container.style.cssText = 'margin-top: 8px; padding: 4px 6px;';

    const isComplete = result.matched === result.total;
    const hasMissing = result.missing.length > 0;

    // Status line
    const statusLine = document.createElement('div');
    statusLine.style.cssText = `
      font-size: 11px; cursor: ${hasMissing ? 'pointer' : 'default'};
      user-select: none;
    `;

    if (isComplete) {
      statusLine.style.color = '#4caf50';
      statusLine.textContent = `${result.matched}/${result.total} complete`;
    } else {
      statusLine.style.color = '#ff9800';
      const missingCount = result.total - result.matched;
      statusLine.textContent = `${result.matched}/${result.total} \u2014 ${missingCount} missing`;
      if (hasMissing) {
        statusLine.textContent += ' (click to expand)';
      }
    }

    if (hasMissing) {
      statusLine.addEventListener('click', () => {
        this.missingExpanded = !this.missingExpanded;
        this.render();
      });
    }

    container.appendChild(statusLine);

    // Expandable missing list
    if (hasMissing && this.missingExpanded) {
      const detailPanel = document.createElement('div');
      detailPanel.style.cssText = `
        margin-top: 4px; padding: 4px 6px;
        background: #1e1e3a; border-radius: 3px;
        max-height: 200px; overflow-y: auto;
        font-size: 11px; color: #e0e0e0;
      `;

      for (const mc of result.missing) {
        const [tl, tr, br, bl] = mc.corners;
        const entry = document.createElement('div');
        entry.style.cssText = 'padding: 1px 0; color: #ccc;';
        const tlName = this.colorIdToName(ws, tl);
        const trName = this.colorIdToName(ws, tr);
        const brName = this.colorIdToName(ws, br);
        const blName = this.colorIdToName(ws, bl);
        entry.textContent = `TL=${tlName}, TR=${trName}, BR=${brName}, BL=${blName}`;
        detailPanel.appendChild(entry);
      }

      container.appendChild(detailPanel);
    }

    return container;
  }

  /**
   * Convert a 1-based color ID to a human-readable name.
   */
  private colorIdToName(ws: WangSetData, colorId: number): string {
    const color = ws.colors[colorId - 1];
    return color ? color.name : `Color ${colorId}`;
  }

  /**
   * Convert HSL values to a hex color string.
   */
  private hslToHex(h: number, s: number, l: number): string {
    const sNorm = s / 100;
    const lNorm = l / 100;
    const a = sNorm * Math.min(lNorm, 1 - lNorm);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }
}
