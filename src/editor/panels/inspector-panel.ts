import { EditorState } from '../editor-state.js';
import { startInlineEdit } from '../inline-edit.js';
import { colRowFromTileId } from '../../utils/tile-math.js';
import { wangColorHex } from '../../core/wang-color.js';
import {
  sectionHeader, panelButton, probabilityBadge, numberInput, selectInput,
  DANGER_BTN_STYLE,
} from '../dom-helpers.js';
import type { TileAnimation } from '../../core/metadata-schema.js';

const EMPTY_WANGID = [0, 0, 0, 0, 0, 0, 0, 0];

/** Check if a WangId zone index is active for the given WangSet type */
function isZoneActive(wangIdx: number, type: 'corner' | 'edge' | 'mixed'): boolean {
  if (type === 'mixed') return true;
  const isCorner = wangIdx % 2 === 1;
  return type === 'corner' ? isCorner : !isCorner;
}

/**
 * Tile inspector panel with WangId zone editor and inline per-tile animation editor.
 */
export class InspectorPanel {
  readonly element: HTMLDivElement;
  private state: EditorState;
  private images: HTMLImageElement[];

  // WangId section elements
  private wangIdSection!: HTMLDivElement;
  private previewCanvas!: HTMLCanvasElement;
  private gridContainer!: HTMLDivElement;
  private wangIdDisplay!: HTMLDivElement;
  private infoDisplay!: HTMLDivElement;
  private probabilityContainer!: HTMLDivElement;

  // Slot for externally-mounted panels above animation
  private externalSlot!: HTMLDivElement;

  // Inline animation section
  private animationSection!: HTMLDivElement;
  private animPreviewTimer: ReturnType<typeof setInterval> | null = null;

  constructor(state: EditorState, images: HTMLImageElement[]) {
    this.state = state;
    this.images = images;

    this.element = document.createElement('div');
    this.buildUI();

    const rerender = () => this.render();
    this.state.on('selectedTileChanged', rerender);
    this.state.on('activeColorChanged', rerender);
    this.state.on('metadataChanged', rerender);
    this.state.on('activeWangSetChanged', rerender);
    this.state.on('clipboardChanged', rerender);

    this.render();
  }

  private buildUI(): void {
    this.element.appendChild(sectionHeader('Inspector'));

    // === WangId Section (wrapped in a div for show/hide) ===
    this.wangIdSection = document.createElement('div');

    // Info display
    this.infoDisplay = document.createElement('div');
    this.infoDisplay.style.cssText = 'margin-bottom: 8px; font-size: 12px; color: #888;';
    this.wangIdSection.appendChild(this.infoDisplay);

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
    this.wangIdSection.appendChild(this.previewCanvas);

    // 3x3 WangId grid label
    const gridLabel = document.createElement('div');
    gridLabel.textContent = 'WangId Zones';
    gridLabel.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px;';
    this.wangIdSection.appendChild(gridLabel);

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

    const fillBtn = panelButton('Fill', `
      background: #2a2a3a; color: #aaa; border: 1px solid #555;
      padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;
      align-self: center;
    `);
    fillBtn.title = 'Set all zones to active color';
    fillBtn.addEventListener('click', () => this.paintAllZones());
    gridRow.appendChild(fillBtn);

    this.wangIdSection.appendChild(gridRow);

    // WangId array display
    const wangLabel = document.createElement('div');
    wangLabel.textContent = 'WangId';
    wangLabel.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px;';
    this.wangIdSection.appendChild(wangLabel);

    this.wangIdDisplay = document.createElement('div');
    this.wangIdDisplay.style.cssText = `
      font-family: monospace; font-size: 12px;
      background: #111; padding: 6px 8px;
      border-radius: 3px; border: 1px solid #333;
      word-break: break-all;
    `;
    this.wangIdSection.appendChild(this.wangIdDisplay);

    // Tile probability
    this.probabilityContainer = document.createElement('div');
    this.probabilityContainer.style.cssText = 'margin-top: 8px; margin-bottom: 8px;';
    this.wangIdSection.appendChild(this.probabilityContainer);

    // Action buttons
    const actions = document.createElement('div');
    actions.style.cssText = 'margin-top: 12px; display: flex; flex-direction: column; gap: 4px;';

    const clearBtn = panelButton('Clear WangId', DANGER_BTN_STYLE);
    clearBtn.addEventListener('click', () => {
      if (this.state.selectedTileIds.size > 1) {
        this.state.removeWangTileMulti([...this.state.selectedTileIds]);
      } else if (this.state.selectedTileId >= 0) {
        this.state.removeWangTile(this.state.selectedTileId);
      }
    });
    actions.appendChild(clearBtn);

    this.wangIdSection.appendChild(actions);

    // Slot for externally-mounted panels (e.g. RegionAssignPanel) above animation
    this.externalSlot = document.createElement('div');
    this.wangIdSection.appendChild(this.externalSlot);

    // Inline animation section (after external slot)
    this.animationSection = document.createElement('div');
    this.animationSection.style.cssText = 'margin-top: 12px;';
    this.wangIdSection.appendChild(this.animationSection);

    this.element.appendChild(this.wangIdSection);
  }

  /** Mount an external element above the animation section */
  mountBeforeAnimation(el: HTMLElement): void {
    this.externalSlot.appendChild(el);
  }

  render(): void {
    this.renderWangIdSection();
  }

  private renderWangIdSection(): void {
    const tileId = this.state.selectedTileId;

    if (tileId < 0) {
      this.infoDisplay.textContent = 'No tile selected';
      this.clearPreview();
      this.clearGrid();
      this.wangIdDisplay.textContent = '\u2014';
      this.probabilityContainer.textContent = '';
      this.renderAnimationSection();
      return;
    }

    // Info
    if (this.state.selectedTileIds.size > 1) {
      this.infoDisplay.textContent = `${this.state.selectedTileIds.size} tiles selected (primary: ${tileId})`;
    } else {
      const [col, row] = colRowFromTileId(tileId, this.state.columns);
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

    // Animation section
    this.renderAnimationSection();
  }

  // === Inline Animation Editor ===

  private renderAnimationSection(): void {
    this.cleanUpAnimPreview();
    this.animationSection.replaceChildren();

    const tileId = this.state.selectedTileId;
    if (tileId < 0) return;

    const wt = this.state.getWangTile(tileId);
    const anim = wt?.animation;

    // Section label
    const sectionLabel = document.createElement('div');
    sectionLabel.textContent = 'Animation';
    sectionLabel.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px;';
    this.animationSection.appendChild(sectionLabel);

    // "Is animated?" checkbox
    this.animationSection.appendChild(this.createAnimatedCheckbox(tileId, anim));

    if (!anim) return;

    this.animationSection.appendChild(this.createAnimationControls(tileId, anim));
    this.animationSection.appendChild(this.createFrameSlotsGrid(tileId, anim));
    this.animationSection.appendChild(this.createPopulateRow(tileId, anim));
    this.animationSection.appendChild(this.createAnimationButtons(tileId, anim));
    this.animationSection.appendChild(this.createAnimationPreview(anim));
  }

  private createAnimatedCheckbox(tileId: number, anim: TileAnimation | undefined): HTMLDivElement {
    const checkRow = document.createElement('div');
    checkRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 8px;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!anim;
    checkbox.style.cssText = 'cursor: pointer;';
    checkbox.addEventListener('change', () => {
      const selectedIds = [...this.state.selectedTileIds];
      if (checkbox.checked) {
        const defaultAnim: TileAnimation = {
          frameDuration: 200,
          pattern: 'loop',
          frames: [
            { tileId, tileset: this.state.activeTilesetIndex },
            { tileId: -1, tileset: this.state.activeTilesetIndex },
            { tileId: -1, tileset: this.state.activeTilesetIndex },
          ],
        };
        this.state.setTileAnimation(tileId, defaultAnim);
      } else if (selectedIds.length > 1) {
        this.state.setTileAnimationMulti(selectedIds, undefined);
      } else {
        this.state.setTileAnimation(tileId, undefined);
      }
    });
    checkRow.appendChild(checkbox);

    const checkLabel = document.createElement('span');
    checkLabel.textContent = 'Is animated?';
    checkLabel.style.cssText = 'font-size: 12px; color: #ccc; cursor: pointer;';
    checkLabel.addEventListener('click', () => { checkbox.click(); });
    checkRow.appendChild(checkLabel);

    return checkRow;
  }

  private createAnimationControls(tileId: number, anim: TileAnimation): HTMLDivElement {
    const controlsRow = document.createElement('div');
    controlsRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; font-size: 11px; align-items: center;';

    // Duration
    const durLabel = document.createElement('span');
    durLabel.textContent = 'Duration:';
    durLabel.style.color = '#aaa';
    controlsRow.appendChild(durLabel);

    const durInput = numberInput(anim.frameDuration, { min: '1' });
    durInput.addEventListener('change', () => {
      const val = parseInt(durInput.value, 10);
      if (!isNaN(val) && val > 0) {
        this.state.setTileAnimation(tileId, { ...anim, frameDuration: val });
      }
    });
    durInput.addEventListener('keydown', (e) => e.stopPropagation());
    controlsRow.appendChild(durInput);

    const msLabel = document.createElement('span');
    msLabel.textContent = 'ms';
    msLabel.style.color = '#888';
    controlsRow.appendChild(msLabel);

    // Frame count
    const fcLabel = document.createElement('span');
    fcLabel.textContent = 'Frames:';
    fcLabel.style.cssText = 'color: #aaa; margin-left: 6px;';
    controlsRow.appendChild(fcLabel);

    const fcInput = numberInput(anim.frames.length, { min: '1' });
    fcInput.addEventListener('change', () => {
      const val = parseInt(fcInput.value, 10);
      if (!isNaN(val) && val >= 1) {
        const frames = [...anim.frames];
        while (frames.length < val) {
          frames.push({ tileId: -1, tileset: this.state.activeTilesetIndex });
        }
        if (val < frames.length) frames.length = val;
        this.state.setTileAnimation(tileId, { ...anim, frames });
      }
    });
    fcInput.addEventListener('keydown', (e) => e.stopPropagation());
    controlsRow.appendChild(fcInput);

    // Pattern
    const patLabel = document.createElement('span');
    patLabel.textContent = 'Pattern:';
    patLabel.style.cssText = 'color: #aaa; margin-left: 6px;';
    controlsRow.appendChild(patLabel);

    const patSelect = selectInput(
      [
        { value: 'loop', text: 'loop' },
        { value: 'ping-pong', text: 'ping-pong' },
      ],
      anim.pattern,
    );
    patSelect.addEventListener('change', () => {
      this.state.setTileAnimation(tileId, { ...anim, pattern: patSelect.value as 'loop' | 'ping-pong' });
    });
    controlsRow.appendChild(patSelect);

    return controlsRow;
  }

  private createFrameSlotsGrid(tileId: number, anim: TileAnimation): HTMLDivElement {
    const wrapper = document.createElement('div');

    const slotsLabel = document.createElement('div');
    slotsLabel.textContent = 'Frame Slots';
    slotsLabel.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px;';
    wrapper.appendChild(slotsLabel);

    const slotsContainer = document.createElement('div');
    slotsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px;';

    anim.frames.forEach((frame, frameIdx) => {
      slotsContainer.appendChild(this.createFrameSlot(tileId, anim, frame, frameIdx));
    });

    wrapper.appendChild(slotsContainer);
    return wrapper;
  }

  private createFrameSlot(
    tileId: number,
    anim: TileAnimation,
    frame: { tileId: number; tileset: number },
    frameIdx: number,
  ): HTMLDivElement {
    const slotWrapper = document.createElement('div');
    slotWrapper.style.cssText = 'position: relative;';
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    canvas.style.cssText = `
      image-rendering: pixelated;
      border: 2px solid ${frameIdx === 0 ? '#6666cc' : '#444'};
      border-radius: 3px;
      background: #111;
    `;

    if (frame.tileId >= 0) {
      this.drawFrameThumb(canvas, frame.tileId, frame.tileset);
    } else {
      const ctx = canvas.getContext('2d')!;
      ctx.strokeStyle = '#555';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(4, 4, 40, 40);
    }

    slotWrapper.appendChild(canvas);

    // Frame number label
    const label = document.createElement('div');
    label.textContent = String(frameIdx);
    label.style.cssText = `
      position: absolute; top: 2px; left: 4px;
      font-size: 9px; color: rgba(255,255,255,0.6);
      background: rgba(0,0,0,0.5); padding: 0 3px;
      border-radius: 2px; pointer-events: none;
    `;
    slotWrapper.appendChild(label);

    // X button to clear slot (only if assigned and not locked frame 0)
    if (frame.tileId >= 0 && frameIdx > 0) {
      const clearBtn = document.createElement('button');
      clearBtn.textContent = '\u00d7';
      clearBtn.style.cssText = `
        position: absolute; top: 2px; right: 2px;
        background: rgba(0,0,0,0.7); color: #ccc; border: none;
        cursor: pointer; font-size: 12px; line-height: 1;
        padding: 0 3px; border-radius: 2px;
      `;
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const frames = anim.frames.map((f, i) =>
          i === frameIdx ? { tileId: -1, tileset: this.state.activeTilesetIndex } : { ...f }
        );
        this.state.setTileAnimation(tileId, { ...anim, frames });
      });
      slotWrapper.appendChild(clearBtn);
    }

    return slotWrapper;
  }

  private createPopulateRow(tileId: number, anim: TileAnimation): HTMLDivElement {
    const offsetRow = document.createElement('div');
    offsetRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 8px;';

    const offsetInput = numberInput(3, { min: '1' });
    offsetInput.addEventListener('keydown', (e) => e.stopPropagation());
    offsetRow.appendChild(offsetInput);

    const populateBtn = panelButton('Populate from offset');
    populateBtn.addEventListener('click', () => {
      const offset = parseInt(offsetInput.value, 10);
      if (isNaN(offset) || offset <= 0) return;
      const frames = Array.from({ length: anim.frames.length }, (_, i) => ({
        tileId: tileId + i * offset,
        tileset: this.state.activeTilesetIndex,
      }));
      this.state.setTileAnimation(tileId, { ...anim, frames });
    });
    offsetRow.appendChild(populateBtn);

    return offsetRow;
  }

  private createAnimationButtons(tileId: number, anim: TileAnimation): HTMLDivElement {
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;';

    // Copy animation button
    const copyBtn = panelButton('Copy Animation');
    copyBtn.style.cssText += 'padding: 6px 10px; width: 100%;';
    copyBtn.addEventListener('click', () => this.state.copyTileAnimation());
    btnRow.appendChild(copyBtn);

    // Paste animation button (only when clipboard has data)
    if (this.state.animationClipboard) {
      const pasteBtn = panelButton('Paste Animation', `
        background: #2a3a2a; color: #ccc; border: 1px solid #585;
        cursor: pointer; font-size: 11px; padding: 6px 10px;
        border-radius: 3px; width: 100%;
      `);
      pasteBtn.addEventListener('click', () => this.state.pasteTileAnimation());
      btnRow.appendChild(pasteBtn);
    }

    // Apply to all {color} tiles button
    const ws = this.state.activeWangSet;
    const colorId = this.state.activeColorId;
    if (ws && colorId > 0 && colorId <= ws.colors.length) {
      const colorName = ws.colors[colorId - 1].name;
      const applyBtn = panelButton(`Apply to all ${colorName} tiles`, `
        background: #2a2a3a; color: #ccc; border: 1px solid #558;
        cursor: pointer; font-size: 11px; padding: 6px 10px;
        border-radius: 3px; width: 100%;
      `);
      applyBtn.addEventListener('click', () => this.state.applyAnimationToColorTiles(colorId));
      btnRow.appendChild(applyBtn);
    }

    return btnRow;
  }

  private createAnimationPreview(anim: TileAnimation): HTMLDivElement {
    const wrapper = document.createElement('div');

    const previewLabel = document.createElement('div');
    previewLabel.textContent = 'Preview';
    previewLabel.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px;';
    wrapper.appendChild(previewLabel);

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = 64;
    previewCanvas.height = 64;
    previewCanvas.style.cssText = `
      image-rendering: pixelated;
      border: 1px solid #444;
      border-radius: 4px;
      background: #111;
      margin-bottom: 4px;
    `;
    wrapper.appendChild(previewCanvas);

    const frameCounter = document.createElement('div');
    frameCounter.style.cssText = 'font-size: 11px; color: #888;';
    wrapper.appendChild(frameCounter);

    // Only animate if there are valid frames
    const validFrames = anim.frames.filter(f => f.tileId >= 0);
    if (validFrames.length > 0) {
      let currentIdx = 0;
      let direction = 1;
      const frameCount = anim.frames.length;

      const renderFrame = (): void => {
        const ctx = previewCanvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, 64, 64);

        const frame = anim.frames[currentIdx];
        if (frame && frame.tileId >= 0) {
          this.drawFrameThumb(previewCanvas, frame.tileId, frame.tileset);
        }
        frameCounter.textContent = `Frame ${currentIdx + 1}/${frameCount}`;
      };

      renderFrame();

      this.animPreviewTimer = setInterval(() => {
        if (anim.pattern === 'loop') {
          currentIdx = (currentIdx + 1) % frameCount;
        } else {
          const next = currentIdx + direction;
          if (next >= frameCount) {
            direction = -1;
            currentIdx = frameCount - 2;
          } else if (next < 0) {
            direction = 1;
            currentIdx = 1;
          } else {
            currentIdx = next;
          }
        }
        renderFrame();
      }, anim.frameDuration);
    } else {
      frameCounter.textContent = 'No tiles assigned';
    }

    return wrapper;
  }

  private cleanUpAnimPreview(): void {
    if (this.animPreviewTimer === null) return;
    clearInterval(this.animPreviewTimer);
    this.animPreviewTimer = null;
  }

  /** Draw a tile thumbnail on a canvas at its full size */
  private drawFrameThumb(canvas: HTMLCanvasElement, tileId: number, tilesetIndex: number): void {
    const img = this.images[tilesetIndex];
    if (!img) return;
    const tileset = this.state.metadata.tilesets[tilesetIndex];
    if (!tileset) return;
    const [col, row] = colRowFromTileId(tileId, tileset.columns);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      col * tileset.tileWidth, row * tileset.tileHeight,
      tileset.tileWidth, tileset.tileHeight,
      0, 0, canvas.width, canvas.height,
    );
  }

  // === WangId Section rendering methods ===

  private drawPreview(tileId: number): void {
    const ctx = this.previewCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 128, 128);

    const { tileWidth, tileHeight, columns } = this.state;
    const [col, row] = colRowFromTileId(tileId, columns);

    ctx.drawImage(
      this.images[this.state.activeTilesetIndex],
      col * tileWidth, row * tileHeight, tileWidth, tileHeight,
      0, 0, 128, 128
    );
  }

  private clearPreview(): void {
    const ctx = this.previewCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 128);
  }

  private drawGrid(tileId: number): void {
    this.gridContainer.replaceChildren();

    const ws = this.state.activeWangSet;
    const wt = this.state.getWangTile(tileId);
    const wangid = wt ? wt.wangid : EMPTY_WANGID;
    const type = ws?.type ?? 'corner';

    const gridMap: (number | null)[] = [
      7, 0, 1,
      6, null, 2,
      5, 4, 3,
    ];

    for (let i = 0; i < 9; i++) {
      const wangIdx = gridMap[i];
      const cell = document.createElement('div');

      if (wangIdx === null) {
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
        const isActive = isZoneActive(wangIdx, type);

        const colorId = wangid[wangIdx];
        const bgColor = colorId > 0 ? wangColorHex(colorId) : '#222';

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
    this.gridContainer.replaceChildren();
  }

  private renderProbability(tileId: number): void {
    this.probabilityContainer.replaceChildren();
    const wt = this.state.getWangTile(tileId);
    if (!wt) return;

    const prob = wt.probability ?? 1.0;

    const label = document.createElement('span');
    label.textContent = 'Tile Prob ';
    label.style.cssText = 'font-size: 11px; color: #888;';
    this.probabilityContainer.appendChild(label);

    const probBadge = probabilityBadge(prob);
    probBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startTileProbabilityEdit(probBadge, tileId);
    });
    this.probabilityContainer.appendChild(probBadge);
  }

  private startTileProbabilityEdit(elem: HTMLSpanElement, tileId: number): void {
    const wt = this.state.getWangTile(tileId);
    if (!wt) return;

    const input = numberInput(wt.probability ?? 1.0, {
      min: '0', step: '0.1', width: '48px',
    });
    input.style.cssText += '; border-color: #6666cc; outline: none;';

    startInlineEdit(elem, input, () => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val >= 0) {
        if (this.state.selectedTileIds.size > 1) {
          this.state.setTileProbabilityMulti([...this.state.selectedTileIds], val);
        } else {
          this.state.setTileProbability(tileId, val);
        }
      }
    }, () => this.render());
  }

  /** Apply a wangid mutation function to all selected tiles */
  private applyToSelection(mutate: (base: number[]) => number[]): void {
    if (this.state.selectedTileIds.size > 1) {
      const entries: Array<{ tileId: number; wangid: number[] }> = [];
      for (const selId of this.state.selectedTileIds) {
        const selWt = this.state.getWangTile(selId);
        entries.push({ tileId: selId, wangid: mutate(selWt ? selWt.wangid : EMPTY_WANGID) });
      }
      this.state.setWangIdMulti(entries);
    } else {
      const tileId = this.state.selectedTileId;
      const wt = this.state.getWangTile(tileId);
      this.state.setWangId(tileId, mutate(wt ? wt.wangid : EMPTY_WANGID));
    }
  }

  private paintAllZones(): void {
    if (this.state.selectedTileId < 0) return;
    const ws = this.state.activeWangSet;
    if (!ws) return;

    const type = ws.type;
    const colorId = this.state.activeColorId;

    this.applyToSelection(base => {
      const wangid = [...base];
      for (let i = 0; i < 8; i++) {
        if (isZoneActive(i, type)) wangid[i] = colorId;
      }
      return wangid;
    });
  }

  private paintZone(tileId: number, wangIdx: number): void {
    const wt = this.state.getWangTile(tileId);
    const current = wt ? wt.wangid[wangIdx] : 0;
    const colorId = this.state.activeColorId;
    const newColor = current === colorId ? 0 : colorId;

    this.applyToSelection(base => {
      const wangid = [...base];
      wangid[wangIdx] = newColor;
      return wangid;
    });
  }
}
