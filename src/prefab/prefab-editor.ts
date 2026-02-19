import type { SavedPrefab } from '../core/prefab-schema.js';
import { PrefabEditorState } from './prefab-state.js';
import { PrefabListPanel } from './prefab-list-panel.js';
import { PrefabCanvasPanel } from './prefab-canvas.js';
import { TilesetViewerPanel } from './tileset-viewer.js';

export class PrefabEditor {
  private state: PrefabEditorState;
  private images: HTMLImageElement[];
  private listPanel: PrefabListPanel;
  private canvasPanel: PrefabCanvasPanel;
  private tilesetPanel: TilesetViewerPanel;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveIndicator: HTMLDivElement;
  private toolButtons = new Map<string, HTMLButtonElement>();

  constructor(state: PrefabEditorState, images: HTMLImageElement[]) {
    this.state = state;
    this.images = images;

    this.listPanel = new PrefabListPanel(state);
    this.canvasPanel = new PrefabCanvasPanel(state, images);
    this.tilesetPanel = new TilesetViewerPanel(state, images);

    this.setupLayout();

    // Save indicator
    this.saveIndicator = document.createElement('div');
    this.saveIndicator.style.cssText = `
      position: fixed; top: 8px; right: 16px;
      background: rgba(0,0,0,0.7); color: #888;
      padding: 4px 10px; border-radius: 4px;
      font-size: 11px; z-index: 200;
      display: none; transition: opacity 0.3s;
    `;
    document.body.appendChild(this.saveIndicator);

    // Autosave on prefab data changes (5s debounce)
    this.state.on('prefabDataChanged', () => this.scheduleSave());

    // Flush pending save before switching away from a prefab
    this.state.on('activePrefabChanged', () => this.flushPendingSave());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.state.undo();
      } else if ((e.ctrlKey || e.metaKey) && key === 'z' && e.shiftKey) {
        e.preventDefault();
        this.state.redo();
      } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        this.state.redo();
      } else if (key === 'e') {
        this.state.setTool(this.state.tool === 'erase' ? 'paint' : 'erase');
      } else if (key === 'm') {
        this.state.setTool(this.state.tool === 'move' ? 'paint' : 'move');
      } else if (key === 'c' && !e.ctrlKey && !e.metaKey) {
        this.state.setTool(this.state.tool === 'copy' ? 'paint' : 'copy');
      } else if (key === 'escape') {
        this.state.resetTool();
      }
    });

    // Update tool button styles when tool changes
    this.state.on('toolChanged', () => this.updateToolButtonStyles());
  }

  private setupLayout(): void {
    const overlay = document.getElementById('editor-overlay') as HTMLDivElement;
    overlay.style.cssText = `
      display: block;
      width: 100%;
      height: 100vh;
      background: #1a1a2e;
      color: #e0e0e0;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
    `;
    overlay.replaceChildren();

    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: 220px 1fr 1fr;
      grid-template-rows: 40px 1fr;
      height: 100%;
      width: 100%;
      gap: 0;
    `;

    const topBarStyle = `
      background: #16213e;
      display: flex;
      align-items: center;
      padding: 0 12px;
      border-bottom: 1px solid #333;
      gap: 8px;
    `;

    // Top-left: title
    const topLeft = document.createElement('div');
    topLeft.style.cssText = topBarStyle + 'border-right: 1px solid #333;';
    const title = document.createElement('span');
    title.textContent = 'Prefab Editor';
    title.style.cssText = 'font-weight: 600; font-size: 14px;';
    topLeft.appendChild(title);

    // Top-center: tool buttons (above prefab panel)
    const topCenter = document.createElement('div');
    topCenter.style.cssText = topBarStyle + 'justify-content: center;';
    this.buildToolButtons(topCenter);

    // Top-right: tileset tabs (above tileset panel)
    const topRight = document.createElement('div');
    topRight.style.cssText = topBarStyle + 'border-left: 1px solid #333; justify-content: center;';
    this.buildTilesetTabs(topRight);

    // Left sidebar
    const leftSidebar = document.createElement('div');
    leftSidebar.style.cssText = `
      background: #1e1e3a;
      border-right: 1px solid #333;
      overflow-y: auto;
      padding: 8px;
    `;
    leftSidebar.appendChild(this.listPanel.element);

    // Center (prefab canvas)
    const centerPanel = document.createElement('div');
    centerPanel.style.cssText = `
      background: #12122a;
      overflow: auto;
      position: relative;
    `;
    centerPanel.appendChild(this.canvasPanel.element);

    // Right (tileset viewer)
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = `
      background: #12122a;
      overflow: auto;
      position: relative;
      border-left: 1px solid #333;
    `;
    rightPanel.appendChild(this.tilesetPanel.element);

    grid.appendChild(topLeft);
    grid.appendChild(topCenter);
    grid.appendChild(topRight);
    grid.appendChild(leftSidebar);
    grid.appendChild(centerPanel);
    grid.appendChild(rightPanel);
    overlay.appendChild(grid);
  }

  private buildToolButtons(container: HTMLDivElement): void {
    const btnStyle = `
      background: #333; color: #ccc; border: 1px solid #555;
      padding: 3px 10px; border-radius: 3px; cursor: pointer;
      font-size: 12px; font-family: inherit;
    `;

    const eraserBtn = document.createElement('button');
    eraserBtn.textContent = 'Eraser (E)';
    eraserBtn.style.cssText = btnStyle;
    eraserBtn.addEventListener('click', () => {
      this.state.setTool(this.state.tool === 'erase' ? 'paint' : 'erase');
    });
    this.toolButtons.set('erase', eraserBtn);
    container.appendChild(eraserBtn);

    const moveBtn = document.createElement('button');
    moveBtn.textContent = 'Move (M)';
    moveBtn.style.cssText = btnStyle;
    moveBtn.addEventListener('click', () => {
      this.state.setTool(this.state.tool === 'move' ? 'paint' : 'move');
    });
    this.toolButtons.set('move', moveBtn);
    container.appendChild(moveBtn);

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy (C)';
    copyBtn.style.cssText = btnStyle;
    copyBtn.addEventListener('click', () => {
      this.state.setTool(this.state.tool === 'copy' ? 'paint' : 'copy');
    });
    this.toolButtons.set('copy', copyBtn);
    container.appendChild(copyBtn);

    const anchorBtn = document.createElement('button');
    anchorBtn.textContent = 'Set Anchor';
    anchorBtn.style.cssText = btnStyle;
    anchorBtn.addEventListener('click', () => {
      this.state.setTool(this.state.tool === 'anchor' ? 'paint' : 'anchor');
    });
    this.toolButtons.set('anchor', anchorBtn);
    container.appendChild(anchorBtn);

    const expandBtn = document.createElement('button');
    expandBtn.textContent = '+ Expand Canvas';
    expandBtn.style.cssText = btnStyle;
    expandBtn.addEventListener('click', () => this.state.expandCanvas());
    container.appendChild(expandBtn);
  }

  private updateToolButtonStyles(): void {
    const btnStyle = `
      background: #333; color: #ccc; border: 1px solid #555;
      padding: 3px 10px; border-radius: 3px; cursor: pointer;
      font-size: 12px; font-family: inherit;
    `;
    const activeBtnStyle = `
      background: #6666cc; color: #fff; border: 1px solid #8888ee;
      padding: 3px 10px; border-radius: 3px; cursor: pointer;
      font-size: 12px; font-family: inherit;
    `;

    const eraserBtn = this.toolButtons.get('erase');
    if (eraserBtn) {
      eraserBtn.style.cssText = this.state.tool === 'erase' ? activeBtnStyle : btnStyle;
    }
    const moveBtn = this.toolButtons.get('move');
    if (moveBtn) {
      moveBtn.style.cssText = this.state.tool === 'move' ? activeBtnStyle : btnStyle;
    }
    const copyBtn = this.toolButtons.get('copy');
    if (copyBtn) {
      copyBtn.style.cssText = this.state.tool === 'copy' ? activeBtnStyle : btnStyle;
    }
    const anchorBtn = this.toolButtons.get('anchor');
    if (anchorBtn) {
      anchorBtn.style.cssText = this.state.tool === 'anchor' ? activeBtnStyle : btnStyle;
    }
  }

  private buildTilesetTabs(container: HTMLDivElement): void {
    const tabContainer = document.createElement('div');
    tabContainer.style.cssText = 'display: flex; gap: 0;';

    const tilesets = this.state.metadata.tilesets;
    for (let i = 0; i < tilesets.length; i++) {
      const ts = tilesets[i];
      const btn = document.createElement('button');
      btn.textContent = ts.tilesetImage.replace(/\.\w+$/, '');
      const isActive = i === this.state.activeTilesetIndex;
      btn.style.cssText = `
        padding: 5px 14px; border: none; cursor: pointer;
        font-size: 11px; font-family: inherit;
        background: ${isActive ? '#1e1e3a' : 'transparent'};
        color: ${isActive ? '#e0e0e0' : '#666'};
        border-bottom: 2px solid ${isActive ? '#6666cc' : 'transparent'};
      `;
      btn.addEventListener('click', () => this.state.setActiveTileset(i));
      tabContainer.appendChild(btn);
    }

    this.state.on('activeTilesetChanged', () => {
      const buttons = tabContainer.querySelectorAll('button');
      buttons.forEach((btn, idx) => {
        const isActive = idx === this.state.activeTilesetIndex;
        (btn as HTMLButtonElement).style.cssText = `
          padding: 5px 14px; border: none; cursor: pointer;
          font-size: 11px; font-family: inherit;
          background: ${isActive ? '#1e1e3a' : 'transparent'};
          color: ${isActive ? '#e0e0e0' : '#666'};
          border-bottom: 2px solid ${isActive ? '#6666cc' : 'transparent'};
        `;
      });
    });

    container.appendChild(tabContainer);
  }

  private pendingSaveName: string | null = null;

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.pendingSaveName = this.state.activePrefabName;
    this.showIndicator('Unsaved changes...');
    this.saveTimer = setTimeout(() => this.save(), 5000);
  }

  private flushPendingSave(): void {
    if (!this.saveTimer || !this.pendingSaveName) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const prefab = this.state.prefabs.get(this.pendingSaveName);
    this.pendingSaveName = null;
    if (prefab) this.savePrefab(prefab);
  }

  private save(): void {
    this.saveTimer = null;
    this.pendingSaveName = null;
    const prefab = this.state.activePrefab;
    if (!prefab) return;
    this.savePrefab(prefab);
  }

  private async savePrefab(prefab: SavedPrefab): Promise<void> {
    this.showIndicator('Saving...');
    try {
      const resp = await fetch('/api/save-prefab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: `${prefab.name}.json`,
          data: prefab,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      console.log(`[prefab-editor] Saved ${prefab.name}.json (${prefab.tiles.length} tiles)`);
      this.showIndicator('Saved', 2000);
    } catch (err) {
      console.error('Failed to save prefab:', err);
      this.showIndicator('Save failed!', 5000);
    }
  }

  private showIndicator(text: string, hideAfterMs?: number): void {
    this.saveIndicator.textContent = text;
    this.saveIndicator.style.display = 'block';
    this.saveIndicator.style.opacity = '1';
    if (hideAfterMs) {
      setTimeout(() => {
        this.saveIndicator.style.opacity = '0';
        setTimeout(() => { this.saveIndicator.style.display = 'none'; }, 300);
      }, hideAfterMs);
    }
  }
}
