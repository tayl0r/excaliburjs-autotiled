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
  private toolIndicator!: HTMLDivElement;

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

    const spriteResolver = new SpriteResolver(
      this.tilesetManager.spriteSheet,
      this.tilesetManager.metadata.columns
    );

    // Create autotile tilemap with the primary WangSet
    this.autotileTilemap = new AutotileTilemap(
      MAP_COLS,
      MAP_ROWS,
      this.tilesetManager.metadata.tileWidth,
      this.tilesetManager.metadata.tileHeight,
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
    const tileW = this.tilesetManager.metadata.tileWidth;
    const tileH = this.tilesetManager.metadata.tileHeight;
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

    // Tool mode indicator
    this.toolIndicator = document.createElement('div');
    this.toolIndicator.id = 'tool-indicator';
    this.toolIndicator.style.cssText = `
      position: absolute;
      top: 16px;
      left: 16px;
      padding: 6px 12px;
      background: rgba(0,0,0,0.7);
      color: #fff;
      font-family: monospace;
      font-size: 14px;
      border-radius: 4px;
      z-index: 10;
    `;
    this.updateToolIndicator('brush');
    document.body.appendChild(this.toolIndicator);

    this.inputHandler.setOnToolModeChange((mode) => {
      this.updateToolIndicator(mode);
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
      btn.textContent = color.name;
      btn.dataset.colorId = String(color.id);
      btn.style.cssText = `
        padding: 6px 12px;
        border: 2px solid #fff;
        border-radius: 4px;
        background: ${color.color};
        color: #fff;
        font-weight: bold;
        font-size: 12px;
        cursor: pointer;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
      `;

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

  onPreUpdate(_engine: ex.Engine, delta: number): void {
    this.autotileTilemap?.updateAnimations(delta);
  }

  private updateToolIndicator(mode: ToolMode): void {
    const label = mode === 'brush' ? 'Brush (B)' : 'Fill (G)';
    this.toolIndicator.textContent = label;
  }

  onDeactivate(): void {
    this.hud?.remove();
    this.toolIndicator?.remove();
  }
}
