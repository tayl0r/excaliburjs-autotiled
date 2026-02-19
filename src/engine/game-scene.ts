import * as ex from 'excalibur';
import type { WangSet } from '../core/wang-set.js';
import type { SavedMap } from '../core/map-schema.js';
import { TilesetManager } from './tileset-manager.js';
import { SpriteResolver } from './sprite-resolver.js';
import { AutotileTilemap } from './autotile-tilemap.js';
import { InputHandler, type ToolMode } from './input-handler.js';

const MAP_COLS = 20;
const MAP_ROWS = 20;

const TOOLS: ReadonlyArray<{ mode: ToolMode; label: string; shortcut: string; key: ex.Keys }> = [
  { mode: 'brush', label: 'Brush', shortcut: 'B', key: ex.Keys.B },
  { mode: 'fill', label: 'Fill', shortcut: 'G', key: ex.Keys.G },
];

const TOOLBAR_BTN_STYLE = `
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #ccc;
  font-family: system-ui, sans-serif;
  font-size: 13px;
  cursor: pointer;
  height: 28px;
`;

const KBD_STYLE = `
  font-family: system-ui, sans-serif;
  font-size: 11px;
  color: #888;
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
  padding: 1px 5px;
`;

export class GameScene extends ex.Scene {
  private tilesetManager: TilesetManager;
  private autotileTilemap!: AutotileTilemap;
  private inputHandler!: InputHandler;
  private hud!: HTMLDivElement;
  private toolbar!: HTMLDivElement;
  private toolButtons!: Map<ToolMode, HTMLButtonElement>;
  private currentMapName: string | null = null;
  private currentWangSet!: WangSet;

  constructor(tilesetManager: TilesetManager) {
    super();
    this.tilesetManager = tilesetManager;
  }

  onInitialize(engine: ex.Engine): void {
    this.tilesetManager.initialize();

    this.currentWangSet = this.tilesetManager.primaryWangSet!;
    if (!this.currentWangSet) {
      console.error('No WangSet found in metadata');
      return;
    }

    const wangSet = this.currentWangSet;
    const ts = this.tilesetManager.primaryTileset;
    const spriteResolver = new SpriteResolver(this.tilesetManager.spriteSheets);

    this.autotileTilemap = new AutotileTilemap(
      MAP_COLS,
      MAP_ROWS,
      ts.tileWidth,
      ts.tileHeight,
      wangSet,
      spriteResolver,
      1,
    );

    this.add(this.autotileTilemap.tileMap);
    this.autotileTilemap.initializeAll(1);
    this.autotileTilemap.setAnimationsFromWangSets(this.tilesetManager.metadata.wangsets);

    this.camera.pos = ex.vec(
      (MAP_COLS * ts.tileWidth) / 2,
      (MAP_ROWS * ts.tileHeight) / 2,
    );
    this.camera.zoom = 3;

    this.inputHandler = new InputHandler(engine, this.autotileTilemap);
    this.inputHandler.initialize();

    engine.input.keyboard.on('press', (evt) => {
      const tool = TOOLS.find(t => t.key === evt.key);
      if (tool) this.inputHandler.setToolMode(tool.mode);
    });

    this.createToolbar();
    this.inputHandler.setOnToolModeChange((mode) => this.updateToolbarSelection(mode));
    this.createHUD(wangSet);

    const keyCommands: Record<string, () => void> = { s: () => this.saveMap(), o: () => this.openMap() };
    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const action = keyCommands[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    });
  }

  private createHUD(wangSet: WangSet): void {
    this.hud = document.createElement('div');
    this.hud.id = 'game-hud';
    this.hud.style.cssText = `
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 6px;
      z-index: 10;
      flex-wrap: wrap;
      justify-content: center;
      max-width: 90%;
    `;

    for (const color of wangSet.colors) {
      const btn = document.createElement('button');
      btn.dataset.colorId = String(color.id);
      btn.style.cssText = `
        display: flex; align-items: center; gap: 6px;
        padding: 4px 10px;
        border: 2px solid rgba(255,255,255,0.3);
        border-radius: 4px;
        background: rgba(30, 30, 50, 0.85);
        color: #fff;
        font-size: 12px;
        cursor: pointer;
      `;

      const tsi = color.tilesetIndex;
      const tilesetImage = this.tilesetManager.getImage(tsi);
      const ts = this.tilesetManager.metadata.tilesets[tsi] ?? this.tilesetManager.primaryTileset;
      if (tilesetImage && color.imageTileId >= 0) {
        const thumb = document.createElement('canvas');
        thumb.width = 16;
        thumb.height = 16;
        thumb.style.cssText = 'width: 16px; height: 16px; image-rendering: pixelated; flex-shrink: 0;';
        const ctx = thumb.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          const sx = (color.imageTileId % ts.columns) * ts.tileWidth;
          const sy = Math.floor(color.imageTileId / ts.columns) * ts.tileHeight;
          ctx.drawImage(tilesetImage, sx, sy, ts.tileWidth, ts.tileHeight, 0, 0, 16, 16);
        }
        btn.appendChild(thumb);
      }

      const label = document.createElement('span');
      label.textContent = color.name;
      btn.appendChild(label);

      btn.addEventListener('click', () => {
        this.inputHandler.setActiveColor(color.id);
        this.updateHUDSelection(color.id);
      });

      this.hud.appendChild(btn);
    }

    document.body.appendChild(this.hud);
    this.updateHUDSelection(this.inputHandler.getActiveColor());
  }

  private updateHUDSelection(activeColor: number): void {
    for (const btn of this.hud.querySelectorAll('button')) {
      const isActive = Number(btn.dataset.colorId) === activeColor;
      btn.style.outline = isActive ? '3px solid yellow' : 'none';
      btn.style.outlineOffset = '2px';
    }
  }

  onPreUpdate(_engine: ex.Engine, delta: number): void {
    this.autotileTilemap?.updateAnimations(delta);
  }

  private createToolbar(): void {
    this.toolbar = document.createElement('div');
    this.toolbar.id = 'toolbar';
    this.toolbar.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 36px;
      background: rgba(30, 30, 30, 0.75);
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 0 8px;
      z-index: 10;
    `;

    this.toolButtons = new Map();

    for (const tool of TOOLS) {
      const btn = this.createToolbarButton(tool.label, tool.shortcut);
      btn.dataset.tool = tool.mode;
      btn.addEventListener('click', () => {
        this.inputHandler.setToolMode(tool.mode);
      });
      this.toolbar.appendChild(btn);
      this.toolButtons.set(tool.mode, btn);
    }

    const sep = document.createElement('div');
    sep.style.cssText = 'width: 1px; height: 20px; background: rgba(255,255,255,0.2); margin: 0 6px;';
    this.toolbar.appendChild(sep);

    const saveBtn = this.createToolbarButton('Save', '\u2318S');
    saveBtn.addEventListener('click', () => this.saveMap());
    this.toolbar.appendChild(saveBtn);

    const openBtn = this.createToolbarButton('Open', '\u2318O');
    openBtn.addEventListener('click', () => this.openMap());
    this.toolbar.appendChild(openBtn);

    document.body.appendChild(this.toolbar);
    this.updateToolbarSelection(this.inputHandler.getToolMode());
  }

  private createToolbarButton(label: string, shortcut: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.style.cssText = TOOLBAR_BTN_STYLE;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;

    const kbd = document.createElement('kbd');
    kbd.textContent = shortcut;
    kbd.style.cssText = KBD_STYLE;

    btn.appendChild(labelSpan);
    btn.appendChild(kbd);
    return btn;
  }

  private updateToolbarSelection(activeMode: ToolMode): void {
    for (const [mode, btn] of this.toolButtons) {
      const isActive = mode === activeMode;
      btn.style.background = isActive ? 'rgba(255,255,255,0.15)' : 'transparent';
      btn.style.color = isActive ? '#fff' : '#ccc';
    }
  }

  async saveMap(): Promise<void> {
    if (!this.currentMapName) {
      const name = prompt('Map name:');
      if (!name) return;
      this.currentMapName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    }

    const saved = this.autotileTilemap.toSavedMap(this.currentMapName, this.currentWangSet.name);
    const filename = `${this.currentMapName}.json`;

    try {
      const resp = await fetch('/api/save-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, data: saved }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      window.location.hash = 'map=' + this.currentMapName;
      console.log(`[map] Saved: ${this.currentMapName}`);
    } catch (err) {
      console.error('[map] Save failed:', err);
      alert('Save failed: ' + err);
    }
  }

  async openMap(): Promise<void> {
    try {
      const listResp = await fetch('/api/list-maps');
      const { files } = await listResp.json() as { files: string[] };
      if (files.length === 0) {
        alert('No saved maps found.');
        return;
      }

      const list = files.map((f, i) => `${i + 1}. ${f.replace('.json', '')}`).join('\n');
      const choice = prompt(`Open map:\n${list}\n\nEnter number or name:`);
      if (!choice) return;

      let filename: string;
      const num = parseInt(choice, 10);
      if (!isNaN(num) && num >= 1 && num <= files.length) {
        filename = files[num - 1];
      } else {
        filename = choice.trim().endsWith('.json') ? choice.trim() : choice.trim() + '.json';
      }

      await this.loadMapByFilename(filename);
    } catch (err) {
      console.error('[map] Open failed:', err);
      alert('Open failed: ' + err);
    }
  }

  async loadMapByName(name: string): Promise<void> {
    await this.loadMapByFilename(name + '.json');
  }

  private async loadMapByFilename(filename: string): Promise<void> {
    const resp = await fetch(`/assets/maps/${filename}`);
    if (!resp.ok) throw new Error(`Map not found: ${filename}`);
    const saved: SavedMap = await resp.json();

    const wangSet = this.findWangSetByName(saved.wangSetName);
    if (!wangSet) {
      throw new Error(`WangSet "${saved.wangSetName}" not found in project metadata`);
    }

    this.autotileTilemap.loadSavedMap(saved, wangSet);
    this.currentMapName = saved.name;
    this.currentWangSet = wangSet;
    window.location.hash = 'map=' + saved.name;
    console.log(`[map] Loaded: ${saved.name}`);
  }

  private findWangSetByName(name: string): WangSet | undefined {
    return this.tilesetManager.wangSets.find(ws => ws.name === name);
  }

  onDeactivate(): void {
    this.hud?.remove();
    this.toolbar?.remove();
  }
}
