import { EditorState } from '../editor-state.js';
import { TileAnimation } from '../../core/metadata-schema.js';
import { colRowFromTileId } from '../../utils/tile-math.js';
import { computeAdjacencyPreview } from '../adjacency-preview.js';
import { wangColorHex } from '../../core/wang-color.js';

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
  private adjacencyContainer!: HTMLDivElement;
  private adjacencyLabel!: HTMLDivElement;

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

    this.state.on('selectedTileChanged', () => this.render());
    this.state.on('activeColorChanged', () => this.render());
    this.state.on('metadataChanged', () => this.render());
    this.state.on('activeWangSetChanged', () => this.render());
    this.state.on('clipboardChanged', () => this.render());

    this.render();
  }

  private buildUI(): void {
    const header = document.createElement('h3');
    header.textContent = 'Inspector';
    header.style.cssText = 'margin: 0 0 8px 0; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 1px;';
    this.element.appendChild(header);

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

    this.wangIdSection.appendChild(actions);

    // Adjacency Preview label
    this.adjacencyLabel = document.createElement('div');
    this.adjacencyLabel.textContent = 'Adjacency Preview';
    this.adjacencyLabel.style.cssText = 'font-size: 11px; color: #888; margin-top: 12px; margin-bottom: 4px;';
    this.wangIdSection.appendChild(this.adjacencyLabel);

    // Adjacency Preview 3x3 grid
    this.adjacencyContainer = document.createElement('div');
    this.adjacencyContainer.style.cssText = `
      display: grid;
      grid-template-columns: repeat(3, 40px);
      grid-template-rows: repeat(3, 40px);
      gap: 2px;
      margin-bottom: 12px;
    `;
    this.wangIdSection.appendChild(this.adjacencyContainer);

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
    this.cleanUpAnimPreview();
    this.wangIdSection.style.display = 'block';
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
      this.clearAdjacencyPreview();
      this.renderAnimationSection();
      return;
    }

    // Info
    const [col, row] = colRowFromTileId(tileId, this.state.columns);
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

    // Animation section
    this.renderAnimationSection();
  }

  // === Inline Animation Editor ===

  private renderAnimationSection(): void {
    this.cleanUpAnimPreview();
    while (this.animationSection.firstChild) {
      this.animationSection.removeChild(this.animationSection.firstChild);
    }

    const tileId = this.state.selectedTileId;
    if (tileId < 0) return;

    const wt = this.state.getWangTile(tileId);
    if (!wt) return;

    const hasAnimation = !!wt.animation;

    // Section label
    const sectionLabel = document.createElement('div');
    sectionLabel.textContent = 'Animation';
    sectionLabel.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px;';
    this.animationSection.appendChild(sectionLabel);

    // "Is animated?" checkbox
    const checkRow = document.createElement('div');
    checkRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 8px;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = hasAnimation;
    checkbox.style.cssText = 'cursor: pointer;';
    checkbox.addEventListener('change', () => {
      const selectedIds = [...this.state.selectedTileIds];
      if (checkbox.checked) {
        // Create default animation for primary tile
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
        // Remove animation from all selected tiles
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

    this.animationSection.appendChild(checkRow);

    if (!hasAnimation || !wt.animation) return;

    const anim = wt.animation;

    // Controls row: Duration, Frame count, Pattern
    const controlsRow = document.createElement('div');
    controlsRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; font-size: 11px; align-items: center;';

    const inputStyle = 'background: #1e1e3a; color: #e0e0e0; border: 1px solid #555; font-size: 11px; padding: 2px 4px; border-radius: 3px; width: 50px;';

    // Duration
    const durLabel = document.createElement('span');
    durLabel.textContent = 'Duration:';
    durLabel.style.color = '#aaa';
    controlsRow.appendChild(durLabel);

    const durInput = document.createElement('input');
    durInput.type = 'number';
    durInput.value = String(anim.frameDuration);
    durInput.min = '1';
    durInput.style.cssText = inputStyle;
    durInput.addEventListener('change', () => {
      const val = parseInt(durInput.value, 10);
      if (!isNaN(val) && val > 0) {
        const updated = { ...anim, frameDuration: val };
        this.state.setTileAnimation(tileId, updated);
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

    const fcInput = document.createElement('input');
    fcInput.type = 'number';
    fcInput.value = String(anim.frames.length);
    fcInput.min = '1';
    fcInput.style.cssText = inputStyle;
    fcInput.addEventListener('change', () => {
      const val = parseInt(fcInput.value, 10);
      if (!isNaN(val) && val >= 1) {
        const frames = [...anim.frames];
        while (frames.length < val) {
          frames.push({ tileId: -1, tileset: this.state.activeTilesetIndex });
        }
        if (val < frames.length) frames.length = val;
        const updated: TileAnimation = { ...anim, frames };
        this.state.setTileAnimation(tileId, updated);
      }
    });
    fcInput.addEventListener('keydown', (e) => e.stopPropagation());
    controlsRow.appendChild(fcInput);

    // Pattern
    const patLabel = document.createElement('span');
    patLabel.textContent = 'Pattern:';
    patLabel.style.cssText = 'color: #aaa; margin-left: 6px;';
    controlsRow.appendChild(patLabel);

    const patSelect = document.createElement('select');
    patSelect.style.cssText = 'background: #1e1e3a; color: #e0e0e0; border: 1px solid #555; font-size: 11px; padding: 2px 4px; border-radius: 3px;';
    const loopOpt = document.createElement('option');
    loopOpt.value = 'loop';
    loopOpt.textContent = 'loop';
    loopOpt.selected = anim.pattern === 'loop';
    const ppOpt = document.createElement('option');
    ppOpt.value = 'ping-pong';
    ppOpt.textContent = 'ping-pong';
    ppOpt.selected = anim.pattern === 'ping-pong';
    patSelect.appendChild(loopOpt);
    patSelect.appendChild(ppOpt);
    patSelect.addEventListener('change', () => {
      const updated = { ...anim, pattern: patSelect.value as 'loop' | 'ping-pong' };
      this.state.setTileAnimation(tileId, updated);
    });
    controlsRow.appendChild(patSelect);

    this.animationSection.appendChild(controlsRow);

    // Frame slots label
    const slotsLabel = document.createElement('div');
    slotsLabel.textContent = 'Frame Slots';
    slotsLabel.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px;';
    this.animationSection.appendChild(slotsLabel);

    // Frame slots grid
    const slotsContainer = document.createElement('div');
    slotsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px;';

    anim.frames.forEach((frame, frameIdx) => {
      const slotWrapper = document.createElement('div');
      slotWrapper.style.cssText = 'position: relative;';

      const isLocked = frameIdx === 0;
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 48;
      canvas.style.cssText = `
        image-rendering: pixelated;
        border: 2px solid ${isLocked ? '#6666cc' : '#444'};
        border-radius: 3px;
        background: #111;
      `;

      if (frame.tileId >= 0) {
        this.drawFrameThumb(canvas, frame.tileId, frame.tileset);
      } else {
        // Dashed empty box
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

      slotsContainer.appendChild(slotWrapper);
    });

    this.animationSection.appendChild(slotsContainer);

    // "Populate from offset" row
    const offsetRow = document.createElement('div');
    offsetRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 8px;';

    const offsetInput = document.createElement('input');
    offsetInput.type = 'number';
    offsetInput.value = '3';
    offsetInput.min = '1';
    offsetInput.style.cssText = inputStyle;
    offsetInput.addEventListener('keydown', (e) => e.stopPropagation());
    offsetRow.appendChild(offsetInput);

    const populateBtn = document.createElement('button');
    populateBtn.textContent = 'Populate from offset';
    populateBtn.style.cssText = `
      background: #333; color: #ccc; border: 1px solid #555;
      cursor: pointer; font-size: 11px; padding: 4px 10px;
      border-radius: 3px;
    `;
    populateBtn.addEventListener('click', () => {
      const offset = parseInt(offsetInput.value, 10);
      if (isNaN(offset) || offset <= 0) return;
      const frameCount = anim.frames.length;
      const frames = Array.from({ length: frameCount }, (_, i) => ({
        tileId: tileId + i * offset,
        tileset: this.state.activeTilesetIndex,
      }));
      this.state.setTileAnimation(tileId, { ...anim, frames });
    });
    offsetRow.appendChild(populateBtn);

    this.animationSection.appendChild(offsetRow);

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;';

    // Copy animation button
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy Animation';
    copyBtn.style.cssText = `
      background: #333; color: #ccc; border: 1px solid #555;
      cursor: pointer; font-size: 11px; padding: 6px 10px;
      border-radius: 3px; width: 100%;
    `;
    copyBtn.addEventListener('click', () => {
      this.state.copyTileAnimation();
    });
    btnRow.appendChild(copyBtn);

    // Paste animation button (only when clipboard has data)
    if (this.state.animationClipboard) {
      const pasteBtn = document.createElement('button');
      pasteBtn.textContent = 'Paste Animation';
      pasteBtn.style.cssText = `
        background: #2a3a2a; color: #ccc; border: 1px solid #585;
        cursor: pointer; font-size: 11px; padding: 6px 10px;
        border-radius: 3px; width: 100%;
      `;
      pasteBtn.addEventListener('click', () => {
        this.state.pasteTileAnimation();
      });
      btnRow.appendChild(pasteBtn);
    }

    // Apply to all {color} tiles button
    const ws = this.state.activeWangSet;
    const colorId = this.state.activeColorId;
    if (ws && colorId > 0 && colorId <= ws.colors.length) {
      const colorName = ws.colors[colorId - 1].name;
      const applyBtn = document.createElement('button');
      applyBtn.textContent = `Apply to all ${colorName} tiles`;
      applyBtn.style.cssText = `
        background: #2a2a3a; color: #ccc; border: 1px solid #558;
        cursor: pointer; font-size: 11px; padding: 6px 10px;
        border-radius: 3px; width: 100%;
      `;
      applyBtn.addEventListener('click', () => {
        this.state.applyAnimationToColorTiles(colorId);
      });
      btnRow.appendChild(applyBtn);
    }

    this.animationSection.appendChild(btnRow);

    // Animation preview
    const previewLabel = document.createElement('div');
    previewLabel.textContent = 'Preview';
    previewLabel.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px;';
    this.animationSection.appendChild(previewLabel);

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
    this.animationSection.appendChild(previewCanvas);

    const frameCounter = document.createElement('div');
    frameCounter.style.cssText = 'font-size: 11px; color: #888;';
    this.animationSection.appendChild(frameCounter);

    // Only animate if there are valid frames
    const validFrames = anim.frames.filter(f => f.tileId >= 0);
    if (validFrames.length > 0) {
      let currentIdx = 0;
      let direction = 1;
      const frameCount = anim.frames.length;

      const renderFrame = () => {
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
  }

  private cleanUpAnimPreview(): void {
    if (this.animPreviewTimer !== null) {
      clearInterval(this.animPreviewTimer);
      this.animPreviewTimer = null;
    }
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
    while (this.gridContainer.firstChild) {
      this.gridContainer.removeChild(this.gridContainer.firstChild);
    }

    const ws = this.state.activeWangSet;
    const wt = this.state.getWangTile(tileId);
    const wangid = wt ? wt.wangid : [0, 0, 0, 0, 0, 0, 0, 0];
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
        const isCorner = wangIdx % 2 === 1;
        const isEdge = wangIdx % 2 === 0;
        const isActive = (type === 'corner' && isCorner)
          || (type === 'edge' && isEdge)
          || type === 'mixed';

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

    if (result.tiles[4]) {
      result.tiles[4].tileId = tileId;
    }

    const { tileWidth, tileHeight, columns } = this.state;

    for (let i = 0; i < 9; i++) {
      const tile = result.tiles[i];
      const isCenter = i === 4;

      if (tile && tile.tileId >= 0) {
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
          this.images[this.state.activeTilesetIndex],
          col * tileWidth, row * tileHeight, tileWidth, tileHeight,
          0, 0, 40, 40,
        );

        this.adjacencyContainer.appendChild(canvas);
      } else {
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
