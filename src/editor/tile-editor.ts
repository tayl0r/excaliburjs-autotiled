import type { ProjectMetadata } from '../core/metadata-schema.js';
import { OverlayManager } from './overlay-manager.js';
import { EditorState } from './editor-state.js';
import { TilesetPanel } from './panels/tileset-panel.js';
import { WangSetPanel } from './panels/wangset-panel.js';
import { InspectorPanel } from './panels/inspector-panel.js';
import { TemplatePanel } from './panels/template-panel.js';
import { RegionAssignPanel } from './panels/region-assign-panel.js';
import { panelButton, applyTabStyle } from './dom-helpers.js';

const UNDO_REDO_BTN_STYLE = `
  background: #333; color: #ccc; border: 1px solid #555;
  padding: 3px 10px; border-radius: 3px; cursor: pointer;
  font-size: 12px; font-family: inherit;
`;

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
  private regionAssignPanel: RegionAssignPanel;
  private inspectorTab!: HTMLButtonElement;
  private templateTab!: HTMLButtonElement;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveIndicator: HTMLDivElement;
  private filename: string;

  constructor(metadata: ProjectMetadata, images: HTMLImageElement[]) {
    this.state = new EditorState(metadata);
    this.overlay = new OverlayManager();
    this.filename = 'project.autotile.json';

    this.tilesetPanel = new TilesetPanel(this.state, images);
    this.wangSetPanel = new WangSetPanel(this.state, images);
    this.inspectorPanel = new InspectorPanel(this.state, images);
    this.templatePanel = new TemplatePanel(this.state, images);

    this.regionAssignPanel = new RegionAssignPanel(this.state);

    this.overlay.mountLeft(this.wangSetPanel.element);
    this.overlay.mountCenter(this.tilesetPanel.element);

    // Undo/Redo buttons in top bar
    this.createUndoRedoButtons();

    // Right panel: tab bar + Inspector/Template panels
    this.overlay.mountRight(this.createRightPanel());

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
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.state.redo(); else this.state.undo();
      } else if (key === 'y') {
        e.preventDefault();
        this.state.redo();
      }
    });

    // Render immediately since editor is always visible
    this.tilesetPanel.render();
  }

  setActiveColor(colorId: number): void {
    this.state.setActiveColor(colorId);
  }

  getMetadata(): ProjectMetadata {
    return this.state.metadata;
  }

  private createRightPanel(): HTMLDivElement {
    const rightWrapper = document.createElement('div');
    rightWrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%;';

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display: flex; gap: 0; border-bottom: 1px solid #333; margin-bottom: 8px;';

    this.inspectorTab = document.createElement('button');
    this.inspectorTab.textContent = 'Inspector';
    applyTabStyle(this.inspectorTab, true);
    this.inspectorTab.addEventListener('click', () => {
      this.state.setTemplateMode(false);
    });

    this.templateTab = document.createElement('button');
    this.templateTab.textContent = 'Template';
    applyTabStyle(this.templateTab, false);
    this.templateTab.addEventListener('click', () => {
      this.state.setTemplateMode(true);
    });

    tabBar.appendChild(this.inspectorTab);
    tabBar.appendChild(this.templateTab);
    rightWrapper.appendChild(tabBar);

    // Panel containers
    this.inspectorPanel.element.style.display = 'block';
    this.templatePanel.element.style.display = 'none';

    // Mount region assign panel inside inspector, above animation section
    this.inspectorPanel.mountBeforeAnimation(this.regionAssignPanel.element);

    rightWrapper.appendChild(this.inspectorPanel.element);
    rightWrapper.appendChild(this.templatePanel.element);

    // Listen for template mode changes to toggle panel visibility and tab states
    this.state.on('templateModeChanged', () => {
      const isTemplate = this.state.templateMode;
      this.inspectorPanel.element.style.display = isTemplate ? 'none' : 'block';
      this.templatePanel.element.style.display = isTemplate ? 'block' : 'none';
      applyTabStyle(this.inspectorTab, !isTemplate);
      applyTabStyle(this.templateTab, isTemplate);
    });

    return rightWrapper;
  }

  private createUndoRedoButtons(): void {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 2px; margin-left: 12px;';

    const undoBtn = panelButton('Undo', UNDO_REDO_BTN_STYLE);
    undoBtn.title = 'Undo (Ctrl+Z)';
    undoBtn.addEventListener('click', () => this.state.undo());
    container.appendChild(undoBtn);

    const redoBtn = panelButton('Redo', UNDO_REDO_BTN_STYLE);
    redoBtn.title = 'Redo (Ctrl+Shift+Z)';
    redoBtn.addEventListener('click', () => this.state.redo());
    container.appendChild(redoBtn);

    this.overlay.mountTopBar(container);
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
        JSON.parse(JSON.stringify(meta))
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
