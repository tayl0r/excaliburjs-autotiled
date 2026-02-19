import type { PrefabTool } from './prefab-state.js';
import type { SavedPrefab } from '../core/prefab-schema.js';
import { NUM_PREFAB_LAYERS, type LayerVisibility } from '../core/layers.js';
import { PrefabEditorState } from './prefab-state.js';
import { PrefabListPanel } from './prefab-list-panel.js';
import { PrefabCanvasPanel } from './prefab-canvas.js';
import { TilesetViewerPanel } from './tileset-viewer.js';

const BTN_BASE = 'padding: 3px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; font-family: inherit;';
const BTN_STYLE = `background: #333; color: #ccc; border: 1px solid #555; ${BTN_BASE}`;
const ACTIVE_BTN_STYLE = `background: #6666cc; color: #fff; border: 1px solid #8888ee; ${BTN_BASE}`;

const TOOL_BUTTONS: Array<{ tool: PrefabTool; label: string }> = [
  { tool: 'erase', label: 'Eraser (E)' },
  { tool: 'move', label: 'Move (M)' },
  { tool: 'copy', label: 'Copy (C)' },
  { tool: 'anchor', label: 'Set Anchor' },
];

const VISIBILITY_LABELS: Record<LayerVisibility, string> = {
  all: 'All',
  highlight: 'Highlight',
  hidden: 'Solo',
};

function applyTabStyle(btn: HTMLButtonElement, isActive: boolean): void {
  btn.style.cssText = `
    padding: 5px 14px; border: none; cursor: pointer;
    font-size: 11px; font-family: inherit;
    background: ${isActive ? '#1e1e3a' : 'transparent'};
    color: ${isActive ? '#e0e0e0' : '#666'};
    border-bottom: 2px solid ${isActive ? '#6666cc' : 'transparent'};
  `;
}

export class PrefabEditor {
  private state: PrefabEditorState;
  private images: HTMLImageElement[];
  private listPanel: PrefabListPanel;
  private canvasPanel: PrefabCanvasPanel;
  private tilesetPanel: TilesetViewerPanel;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveIndicator: HTMLDivElement;
  private toolButtons = new Map<PrefabTool, HTMLButtonElement>();
  private layerButtons: HTMLButtonElement[] = [];
  private visibilityButton!: HTMLButtonElement;

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

    document.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Update tool button styles when tool changes
    this.state.on('toolChanged', () => this.updateToolButtonStyles());

    // Update layer bar when layer changes
    this.state.on('activeLayerChanged', () => this.updateLayerBarSelection());
    this.state.on('visibilityChanged', () => this.updateVisibilityButton());
  }

  private toggleTool(tool: PrefabTool): void {
    this.state.setTool(this.state.tool === tool ? 'paint' : tool);
  }

  private static readonly TOOL_KEYS: Record<string, PrefabTool> = {
    e: 'erase', m: 'move', c: 'copy',
  };

  private handleKeydown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    if (mod && key === 'z') {
      e.preventDefault();
      e.shiftKey ? this.state.redo() : this.state.undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      this.state.redo();
      return;
    }
    if (mod) return;

    const toolForKey = PrefabEditor.TOOL_KEYS[key];
    if (toolForKey) { this.toggleTool(toolForKey); return; }
    if (key === 'v') { this.state.cycleVisibility(); return; }
    if (key === 'escape') { this.state.resetTool(); return; }

    const num = parseInt(key, 10);
    if (num >= 1 && num <= NUM_PREFAB_LAYERS) {
      this.state.setActiveLayer(num - 1);
    }
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
      grid-template-rows: 40px 32px 1fr;
      height: 100%;
      width: 100%;
      gap: 0;
    `;

    const topBar = 'background: #16213e; display: flex; align-items: center; padding: 0 12px; border-bottom: 1px solid #333; gap: 8px;';

    const topLeft = document.createElement('div');
    topLeft.style.cssText = topBar + 'border-right: 1px solid #333;';
    const title = document.createElement('span');
    title.textContent = 'Prefab Editor';
    title.style.cssText = 'font-weight: 600; font-size: 14px;';
    topLeft.appendChild(title);

    const topCenter = document.createElement('div');
    topCenter.style.cssText = topBar + 'justify-content: center;';
    this.buildToolButtons(topCenter);

    const topRight = document.createElement('div');
    topRight.style.cssText = topBar + 'border-left: 1px solid #333; justify-content: center;';
    this.buildTilesetTabs(topRight);

    // Layer bar (row 2, spans all 3 columns)
    const layerBar = document.createElement('div');
    layerBar.style.cssText = `
      grid-column: 1 / -1;
      background: #16213e;
      display: flex;
      align-items: center;
      padding: 0 12px;
      border-bottom: 1px solid #333;
      gap: 4px;
    `;
    this.buildLayerBar(layerBar);

    // Left sidebar
    const leftSidebar = document.createElement('div');
    leftSidebar.style.cssText = `
      background: #1e1e3a;
      border-right: 1px solid #333;
      overflow-y: auto;
      padding: 8px;
    `;
    leftSidebar.appendChild(this.listPanel.element);

    const panelBase = 'background: #12122a; overflow: auto; position: relative;';

    const centerPanel = document.createElement('div');
    centerPanel.style.cssText = panelBase;
    centerPanel.appendChild(this.canvasPanel.element);

    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = panelBase + 'border-left: 1px solid #333;';
    rightPanel.appendChild(this.tilesetPanel.element);

    grid.appendChild(topLeft);
    grid.appendChild(topCenter);
    grid.appendChild(topRight);
    grid.appendChild(layerBar);
    grid.appendChild(leftSidebar);
    grid.appendChild(centerPanel);
    grid.appendChild(rightPanel);
    overlay.appendChild(grid);
  }

  private buildToolButtons(container: HTMLDivElement): void {
    for (const { tool, label } of TOOL_BUTTONS) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = BTN_STYLE;
      btn.addEventListener('click', () => this.toggleTool(tool));
      this.toolButtons.set(tool, btn);
      container.appendChild(btn);
    }

    const expandBtn = document.createElement('button');
    expandBtn.textContent = '+ Expand Canvas';
    expandBtn.style.cssText = BTN_STYLE;
    expandBtn.addEventListener('click', () => this.state.expandCanvas());
    container.appendChild(expandBtn);
  }

  private buildLayerBar(container: HTMLDivElement): void {
    const label = document.createElement('span');
    label.textContent = 'Layer:';
    label.style.cssText = 'color: #888; font-size: 12px; margin-right: 4px;';
    container.appendChild(label);

    this.layerButtons = [];
    for (let i = 0; i < NUM_PREFAB_LAYERS; i++) {
      const btn = document.createElement('button');
      btn.textContent = String(i + 1);
      btn.style.cssText = BTN_STYLE;
      btn.addEventListener('click', () => this.state.setActiveLayer(i));
      container.appendChild(btn);
      this.layerButtons.push(btn);
    }

    const sep = document.createElement('div');
    sep.style.cssText = 'width: 1px; height: 20px; background: rgba(255,255,255,0.2); margin: 0 6px;';
    container.appendChild(sep);

    this.visibilityButton = document.createElement('button');
    this.visibilityButton.textContent = VISIBILITY_LABELS[this.state.visibilityMode] + ' (V)';
    this.visibilityButton.style.cssText = BTN_STYLE;
    this.visibilityButton.addEventListener('click', () => this.state.cycleVisibility());
    container.appendChild(this.visibilityButton);

    this.updateLayerBarSelection();
  }

  private updateLayerBarSelection(): void {
    const activeLayer = this.state.activeLayer;
    for (let i = 0; i < this.layerButtons.length; i++) {
      this.layerButtons[i].style.cssText = i === activeLayer ? ACTIVE_BTN_STYLE : BTN_STYLE;
    }
  }

  private updateVisibilityButton(): void {
    this.visibilityButton.textContent = VISIBILITY_LABELS[this.state.visibilityMode] + ' (V)';
  }

  private updateToolButtonStyles(): void {
    for (const [tool, btn] of this.toolButtons) {
      btn.style.cssText = this.state.tool === tool ? ACTIVE_BTN_STYLE : BTN_STYLE;
    }
  }

  private buildTilesetTabs(container: HTMLDivElement): void {
    const tabContainer = document.createElement('div');
    tabContainer.style.cssText = 'display: flex; gap: 0;';

    const tilesets = this.state.metadata.tilesets;
    for (let i = 0; i < tilesets.length; i++) {
      const btn = document.createElement('button');
      btn.textContent = tilesets[i].tilesetImage.replace(/\.\w+$/, '');
      applyTabStyle(btn, i === this.state.activeTilesetIndex);
      btn.addEventListener('click', () => this.state.setActiveTileset(i));
      tabContainer.appendChild(btn);
    }

    this.state.on('activeTilesetChanged', () => {
      const buttons = tabContainer.querySelectorAll('button');
      buttons.forEach((btn, idx) => {
        applyTabStyle(btn as HTMLButtonElement, idx === this.state.activeTilesetIndex);
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
      const tileCount = prefab.layers.reduce((sum, l) => sum + l.length, 0);
      console.log(`[prefab-editor] Saved ${prefab.name}.json (${tileCount} tiles)`);
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
