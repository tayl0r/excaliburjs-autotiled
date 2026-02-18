import * as ex from 'excalibur';
import { TilesetManager } from './tileset-manager.js';
import { SpriteResolver } from './sprite-resolver.js';
import { AutotileTilemap } from './autotile-tilemap.js';
import { InputHandler, ToolMode } from './input-handler.js';

const MAP_COLS = 20;
const MAP_ROWS = 20;

export class GameScene extends ex.Scene {
  private tilesetManager: TilesetManager;
  private autotileTilemap!: AutotileTilemap;
  private inputHandler!: InputHandler;
  private hud!: HTMLDivElement;
  private toolbar!: HTMLDivElement;
  private toolButtons!: Map<ToolMode, HTMLButtonElement>;

  constructor(tilesetManager: TilesetManager) {
    super();
    this.tilesetManager = tilesetManager;
  }

  onInitialize(engine: ex.Engine): void {
    this.tilesetManager.initialize();

    const wangSet = this.tilesetManager.primaryWangSet;
    if (!wangSet) {
      console.error('No WangSet found in metadata');
      return;
    }

    const ts = this.tilesetManager.primaryTileset;
    const spriteResolver = new SpriteResolver(
      this.tilesetManager.spriteSheets
    );

    // Create autotile tilemap with the primary WangSet
    this.autotileTilemap = new AutotileTilemap(
      MAP_COLS,
      MAP_ROWS,
      ts.tileWidth,
      ts.tileHeight,
      wangSet,
      spriteResolver,
      1 // default to Grass
    );

    this.add(this.autotileTilemap.tileMap);
    this.autotileTilemap.initializeAll(1);

    // Set up animations if available
    const animations = this.tilesetManager.animations;
    if (animations.length > 0) {
      this.autotileTilemap.setAnimations(animations);
    }

    // Set up camera
    const tileW = ts.tileWidth;
    const tileH = ts.tileHeight;
    this.camera.pos = ex.vec(
      (MAP_COLS * tileW) / 2,
      (MAP_ROWS * tileH) / 2
    );
    this.camera.zoom = 3;

    // Set up input
    this.inputHandler = new InputHandler(engine, this.autotileTilemap);
    this.inputHandler.initialize();

    // Keyboard shortcuts: B=brush, G=fill
    engine.input.keyboard.on('press', (evt) => {
      if (evt.key === ex.Keys.B) {
        this.inputHandler.setToolMode('brush');
      } else if (evt.key === ex.Keys.G) {
        this.inputHandler.setToolMode('fill');
      }
    });

    // Top toolbar
    this.createToolbar();

    this.inputHandler.setOnToolModeChange((mode) => {
      this.updateToolbarSelection(mode);
    });

    // Create HUD from WangSet colors
    this.createHUD(wangSet);
  }

  private createHUD(wangSet: import('../core/wang-set.js').WangSet): void {
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

      // Tile thumbnail — use the color's tileset index
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
    const buttons = this.hud.querySelectorAll('button');
    buttons.forEach((btn) => {
      const id = Number(btn.dataset.colorId);
      btn.style.outline = id === activeColor ? '3px solid yellow' : 'none';
      btn.style.outlineOffset = '2px';
    });
  }

  /** Reload WangSet data from updated metadata and re-resolve all tiles */
  reloadMetadata(metadata: import('../core/metadata-schema.js').ProjectMetadata): void {
    this.tilesetManager.reload(metadata);
    const wangSet = this.tilesetManager.primaryWangSet;
    if (!wangSet) return;
    this.autotileTilemap.updateWangSet(wangSet);

    const totalTiles = metadata.wangsets.reduce((s, ws) => s + ws.wangtiles.length, 0);
    const totalColors = metadata.wangsets.reduce((s, ws) => s + ws.colors.length, 0);
    console.log(
      `[metadata] Reloaded terrain.autotile.json:`,
      `${metadata.wangsets.length} WangSet(s),`,
      `${totalColors} colors,`,
      `${totalTiles} tagged tiles`
    );

    // Rebuild HUD with potentially updated colors
    this.hud?.remove();
    this.createHUD(wangSet);
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

    const tools: Array<{ mode: ToolMode; label: string; shortcut: string }> = [
      { mode: 'brush', label: 'Brush', shortcut: 'B' },
      { mode: 'fill', label: 'Fill', shortcut: 'G' },
      { mode: 'tiledata', label: 'Tile Data', shortcut: 'T' },
    ];

    for (const tool of tools) {
      const btn = document.createElement('button');
      btn.dataset.tool = tool.mode;
      btn.style.cssText = `
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

      const label = document.createElement('span');
      label.textContent = tool.label;

      const kbd = document.createElement('kbd');
      kbd.textContent = tool.shortcut;
      kbd.style.cssText = `
        font-family: system-ui, sans-serif;
        font-size: 11px;
        color: #888;
        background: rgba(255,255,255,0.1);
        border-radius: 3px;
        padding: 1px 5px;
      `;

      btn.appendChild(label);
      btn.appendChild(kbd);

      if (tool.mode === 'tiledata') {
        // Tile Data toggles the editor overlay via synthetic keypress
        btn.addEventListener('click', () => {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'T' }));
        });
      } else {
        btn.addEventListener('click', () => {
          this.inputHandler.setToolMode(tool.mode);
        });
      }

      this.toolbar.appendChild(btn);
      this.toolButtons.set(tool.mode, btn);
    }

    document.body.appendChild(this.toolbar);
    this.updateToolbarSelection(this.inputHandler.getToolMode());
  }

  private updateToolbarSelection(activeMode: ToolMode): void {
    for (const [mode, btn] of this.toolButtons) {
      if (mode === activeMode) {
        btn.style.background = 'rgba(255,255,255,0.15)';
        btn.style.color = '#fff';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = '#ccc';
      }
    }
  }

  onDeactivate(): void {
    this.hud?.remove();
    this.toolbar?.remove();
  }
}
