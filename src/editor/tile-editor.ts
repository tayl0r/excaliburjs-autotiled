import { TilesetMetadata } from '../core/metadata-schema.js';
import { OverlayManager } from './overlay-manager.js';
import { EditorState } from './editor-state.js';
import { TilesetPanel } from './panels/tileset-panel.js';
import { WangSetPanel } from './panels/wangset-panel.js';
import { InspectorPanel } from './panels/inspector-panel.js';
import { TemplatePanel } from './panels/template-panel.js';

/**
 * Top-level editor controller. Creates and wires all editor components.
 * Auto-saves metadata to the backend 5 seconds after the last edit.
 */
export class TileEditor {
  private overlay: OverlayManager;
  private state: EditorState;
  private tilesetPanel: TilesetPanel;
  private wangSetPanel: WangSetPanel;
  private inspectorPanel: InspectorPanel;
  private templatePanel: TemplatePanel;
  private inspectorTab!: HTMLButtonElement;
  private templateTab!: HTMLButtonElement;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveIndicator: HTMLDivElement;
  private filename: string;

  constructor(metadata: TilesetMetadata, image: HTMLImageElement) {
    this.state = new EditorState(metadata);
    this.overlay = new OverlayManager();
    this.filename = metadata.tilesetImage.replace(/\.\w+$/, '') + '.autotile.json';

    this.tilesetPanel = new TilesetPanel(this.state, image);
    this.wangSetPanel = new WangSetPanel(this.state);
    this.inspectorPanel = new InspectorPanel(this.state, image);
    this.templatePanel = new TemplatePanel(this.state, image);

    this.overlay.mountLeft(this.wangSetPanel.element);
    this.overlay.mountCenter(this.tilesetPanel.element);

    // Right panel: tab bar + Inspector/Template panels
    const rightWrapper = document.createElement('div');
    rightWrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%;';

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display: flex; gap: 0; border-bottom: 1px solid #333; margin-bottom: 8px;';

    const tabBtnStyle = 'padding: 6px 16px; border: none; cursor: pointer; font-size: 12px; font-family: inherit;';
    const activeTabStyle = `${tabBtnStyle} background: #1e1e3a; color: #e0e0e0; border-bottom: 2px solid #6666cc;`;
    const inactiveTabStyle = `${tabBtnStyle} background: transparent; color: #888; border-bottom: 2px solid transparent;`;

    this.inspectorTab = document.createElement('button');
    this.inspectorTab.textContent = 'Inspector';
    this.inspectorTab.style.cssText = activeTabStyle;
    this.inspectorTab.addEventListener('click', () => {
      this.state.setTemplateMode(false);
    });

    this.templateTab = document.createElement('button');
    this.templateTab.textContent = 'Template';
    this.templateTab.style.cssText = inactiveTabStyle;
    this.templateTab.addEventListener('click', () => {
      this.state.setTemplateMode(true);
    });

    tabBar.appendChild(this.inspectorTab);
    tabBar.appendChild(this.templateTab);
    rightWrapper.appendChild(tabBar);

    // Panel containers
    this.inspectorPanel.element.style.display = 'block';
    this.templatePanel.element.style.display = 'none';
    rightWrapper.appendChild(this.inspectorPanel.element);
    rightWrapper.appendChild(this.templatePanel.element);

    this.overlay.mountRight(rightWrapper);

    // Listen for template mode changes to toggle panel visibility and tab states
    this.state.on('templateModeChanged', () => {
      const isTemplate = this.state.templateMode;
      this.inspectorPanel.element.style.display = isTemplate ? 'none' : 'block';
      this.templatePanel.element.style.display = isTemplate ? 'block' : 'none';
      this.inspectorTab.style.cssText = isTemplate ? inactiveTabStyle : activeTabStyle;
      this.templateTab.style.cssText = isTemplate ? activeTabStyle : inactiveTabStyle;
    });

    // Save indicator (shown in top bar area)
    this.saveIndicator = document.createElement('div');
    this.saveIndicator.style.cssText = `
      position: fixed; top: 8px; right: 16px;
      background: rgba(0,0,0,0.7); color: #888;
      padding: 4px 10px; border-radius: 4px;
      font-size: 11px; z-index: 200;
      display: none; transition: opacity 0.3s;
    `;
    document.body.appendChild(this.saveIndicator);

    // Auto-save on metadata changes
    this.state.on('metadataChanged', () => this.scheduleSave());

    // Undo/Redo keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.overlay.isActive) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.state.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        this.state.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        this.state.redo();
      }
    });
  }

  get isActive(): boolean {
    return this.overlay.isActive;
  }

  toggle(): void {
    this.overlay.toggle();
    if (this.overlay.isActive) {
      this.tilesetPanel.render();
    }
  }

  show(): void {
    this.overlay.show();
    this.tilesetPanel.render();
  }

  hide(): void {
    this.overlay.hide();
  }

  setActiveColor(colorId: number): void {
    this.state.setActiveColor(colorId);
  }

  /** Get the current metadata (for saving or applying to game) */
  getMetadata(): TilesetMetadata {
    return this.state.metadata;
  }

  /** Schedule a save after 5 seconds of inactivity */
  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.showIndicator('Unsaved changes...');
    this.saveTimer = setTimeout(() => this.save(), 5000);
  }

  /** Save metadata to the backend */
  private async save(): Promise<void> {
    this.saveTimer = null;
    this.showIndicator('Saving...');

    try {
      const resp = await fetch('/api/save-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: this.filename,
          data: this.state.metadata,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text);
      }

      const meta = this.state.metadata;
      const totalTiles = meta.wangsets.reduce((s, ws) => s + ws.wangtiles.length, 0);
      const totalColors = meta.wangsets.reduce((s, ws) => s + ws.colors.length, 0);
      console.log(
        `[editor] Saved ${this.filename}:`,
        `${meta.wangsets.length} WangSet(s),`,
        `${totalColors} colors,`,
        `${totalTiles} tagged tiles`,
        meta.wangsets.map(ws => ({
          name: ws.name,
          type: ws.type,
          colors: ws.colors.map(c => c.name),
          tiles: ws.wangtiles.map(wt => wt.tileid),
        }))
      );

      this.showIndicator('Saved', 2000);
    } catch (err) {
      console.error('Failed to save metadata:', err);
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
