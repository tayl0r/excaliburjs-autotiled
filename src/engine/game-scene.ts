import * as ex from 'excalibur';
import type { WangSet } from '../core/wang-set.js';
import { type SavedMap, type PlacedPrefab, parseSavedMap } from '../core/map-schema.js';
import type { SavedPrefab, PrefabTile } from '../core/prefab-schema.js';
import { NUM_MAP_LAYERS, NUM_EDITABLE_LAYERS, NUM_PREFAB_LAYERS, type LayerVisibility } from '../core/layers.js';
import { createCell } from '../core/cell.js';
import type { Cell } from '../core/cell.js';
import { TilesetManager } from './tileset-manager.js';
import { SpriteResolver } from './sprite-resolver.js';
import { AutotileTilemap } from './autotile-tilemap.js';
import { InputHandler, type ToolMode } from './input-handler.js';

const MAP_COLS = 20;
const MAP_ROWS = 20;

const PAINT_TOOLS: ReadonlyArray<{ mode: ToolMode; label: string; shortcut: string; key: ex.Keys }> = [
  { mode: 'brush', label: 'Brush', shortcut: 'B', key: ex.Keys.B },
  { mode: 'fill', label: 'Fill', shortcut: 'G', key: ex.Keys.G },
];

const SIDEBAR_WIDTH = 240;

const VISIBILITY_LABELS: Record<LayerVisibility, string> = {
  all: 'All',
  highlight: 'Highlight',
  hidden: 'Solo',
};

const VISIBILITY_ORDER: LayerVisibility[] = ['all', 'highlight', 'hidden'];

// Sidebar styling constants
const SIDEBAR_BG = '#1e1e2e';
const SIDEBAR_BORDER = '#333';
const SIDEBAR_TEXT = '#ccc';
const SIDEBAR_SECTION_HEADER = '#888';
const SIDEBAR_BTN_ACTIVE = 'rgba(255,255,255,0.15)';

interface CellSnapshot {
  layer: number;
  x: number;
  y: number;
  cell: Cell;
}

interface PrefabUndoEntry {
  ref: PlacedPrefab;
  previousCells: CellSnapshot[];
}

/** Convert a PrefabTile to a Cell (prefab tiles have no flip transforms) */
function cellFromPrefabTile(tile: PrefabTile): Cell {
  return createCell(tile.tileId, false, false, false, tile.tilesetIndex);
}

/** Set active styling on a button */
function setButtonActive(btn: HTMLButtonElement, active: boolean): void {
  btn.style.background = active ? SIDEBAR_BTN_ACTIVE : 'transparent';
  btn.style.color = active ? '#fff' : SIDEBAR_TEXT;
}

export class GameScene extends ex.Scene {
  private tilesetManager: TilesetManager;
  private layers: AutotileTilemap[] = [];
  private inputHandler!: InputHandler;
  private currentMapName: string | null = null;
  private currentWangSet!: WangSet;
  private activeLayerIndex = 0;
  private visibilityMode: LayerVisibility = 'all';

  // Sidebar
  private sidebar!: HTMLDivElement;
  private expandBtn!: HTMLButtonElement;
  private sidebarCollapsed = false;
  private toolButtons!: Map<ToolMode, HTMLButtonElement>;
  private layerButtons: HTMLButtonElement[] = [];
  private visibilityButton!: HTMLButtonElement;
  private colorButtons: HTMLButtonElement[] = [];

  // Autosave
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveIndicator!: HTMLDivElement;

  // Prefab system
  private prefabs: SavedPrefab[] = [];
  private placedPrefabs: PlacedPrefab[] = [];
  private activePrefab: SavedPrefab | null = null;
  private previewLayers: AutotileTilemap[] = [];
  private prefabUndoStack: PrefabUndoEntry[] = [];
  private prefabRedoStack: PrefabUndoEntry[] = [];
  private previewedCells: Array<{ layer: number; x: number; y: number }> = [];
  private prefabListContainer!: HTMLDivElement;
  private prefabButtons: HTMLButtonElement[] = [];

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

    const addLayer = (zIndex: number, defaultColor: number): AutotileTilemap => {
      const layer = new AutotileTilemap(
        MAP_COLS, MAP_ROWS, ts.tileWidth, ts.tileHeight,
        wangSet, spriteResolver, defaultColor,
      );
      layer.tileMap.z = zIndex;
      this.add(layer.tileMap);
      return layer;
    };

    for (let i = 0; i < NUM_MAP_LAYERS; i++) {
      this.layers.push(addLayer(i, i === 0 ? 1 : 0));
    }

    for (let i = 0; i < NUM_PREFAB_LAYERS; i++) {
      const preview = addLayer(100 + i, 0);
      preview.setOpacity(0.4);
      this.previewLayers.push(preview);
    }

    // Initialize layer 0 with base terrain
    this.layers[0].initializeAll(1);

    // Set up animations on all layers
    for (const layer of this.layers) {
      layer.setAnimationsFromWangSets(this.tilesetManager.metadata.wangsets);
    }

    this.camera.pos = ex.vec(
      (MAP_COLS * ts.tileWidth) / 2,
      (MAP_ROWS * ts.tileHeight) / 2,
    );
    this.camera.zoom = 3;

    this.inputHandler = new InputHandler(engine, this.layers[0]);
    this.inputHandler.initialize();

    this.inputHandler.setOnCursorMove((pos) => this.updatePrefabPreview(pos));
    this.inputHandler.setOnPrefabPlace((tx, ty) => this.placePrefab(tx, ty));
    this.inputHandler.setOnMapChanged(() => this.scheduleAutosave());

    engine.input.keyboard.on('press', (evt) => {
      const tool = PAINT_TOOLS.find(t => t.key === evt.key);
      if (tool) {
        this.selectTool(tool.mode);
      }

      // Layer switching with 1-5
      const layerNum = parseInt(evt.key.replace('Digit', '').replace('Numpad', ''), 10);
      if (layerNum >= 1 && layerNum <= NUM_EDITABLE_LAYERS) {
        this.setActiveLayer(layerNum - 1);
      }

      if (evt.key === ex.Keys.V) this.cycleVisibility();
      if (evt.key === ex.Keys.Tab) this.toggleSidebar();
      if (evt.key === ex.Keys.Escape) this.cancelPrefab();
    });

    this.createSidebar(wangSet);
    this.createSaveIndicator();
    this.inputHandler.setOnToolModeChange((mode) => this.updateToolSelection(mode));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') e.preventDefault();
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 's') { e.preventDefault(); this.saveMap(); }
      if (e.key === 'o') { e.preventDefault(); this.openMap(); }
      if (e.key === 'z' && e.shiftKey) { e.preventDefault(); this.redoPrefab(); }
      else if (e.key === 'z') { e.preventDefault(); this.undoPrefab(); }
    });
  }

  setPrefabs(prefabs: SavedPrefab[]): void {
    this.prefabs = prefabs;
    this.rebuildPrefabList();
  }

  setActiveLayer(index: number): void {
    if (index < 0 || index >= NUM_EDITABLE_LAYERS) return;
    this.activeLayerIndex = index;
    this.inputHandler.setTilemap(this.layers[index]);
    this.applyVisibility();
    this.updateLayerSelection();
    this.updateHash();
  }

  private applyVisibility(): void {
    const inactiveOpacity = this.visibilityMode === 'all' ? 1.0
      : this.visibilityMode === 'highlight' ? 0.25
      : 0;
    for (let i = 0; i < NUM_MAP_LAYERS; i++) {
      this.layers[i].setOpacity(i === this.activeLayerIndex ? 1.0 : inactiveOpacity);
    }
  }

  private cycleVisibility(): void {
    const idx = VISIBILITY_ORDER.indexOf(this.visibilityMode);
    this.visibilityMode = VISIBILITY_ORDER[(idx + 1) % VISIBILITY_ORDER.length];
    this.applyVisibility();
    this.visibilityButton.querySelector('span')!.textContent = VISIBILITY_LABELS[this.visibilityMode];
  }

  // --- Sidebar ---

  private createSidebar(wangSet: WangSet): void {
    this.sidebar = document.createElement('div');
    this.sidebar.id = 'sidebar';
    this.sidebar.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      width: ${SIDEBAR_WIDTH}px;
      background: ${SIDEBAR_BG};
      border-right: 1px solid ${SIDEBAR_BORDER};
      z-index: 20;
      overflow-y: auto;
      font-family: system-ui, sans-serif;
      font-size: 13px;
      color: ${SIDEBAR_TEXT};
      display: flex;
      flex-direction: column;
    `;

    this.sidebar.appendChild(this.buildHeader());
    this.sidebar.appendChild(this.buildFileSection());
    this.sidebar.appendChild(this.buildToolSection());
    this.sidebar.appendChild(this.buildLayerSection());
    this.sidebar.appendChild(this.buildColorSection(wangSet));
    this.sidebar.appendChild(this.buildPrefabSection());

    document.body.appendChild(this.sidebar);

    // Expand button — visible only when sidebar is collapsed
    this.expandBtn = document.createElement('button');
    this.expandBtn.textContent = '\u25B6';
    this.expandBtn.title = 'Expand sidebar (Tab)';
    this.expandBtn.style.cssText = `
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 20;
      border: 1px solid ${SIDEBAR_BORDER};
      background: ${SIDEBAR_BG};
      color: ${SIDEBAR_TEXT};
      cursor: pointer;
      font-size: 14px;
      padding: 4px 8px;
      border-radius: 4px;
      display: none;
    `;
    this.expandBtn.addEventListener('click', () => this.toggleSidebar());
    document.body.appendChild(this.expandBtn);

    this.applySidebarLayout();
  }

  private buildHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid ${SIDEBAR_BORDER};
      flex-shrink: 0;
    `;

    const title = document.createElement('span');
    title.textContent = 'Map Painter';
    title.style.cssText = 'font-weight: 600; font-size: 14px; color: #eee;';

    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = '\u25C0';
    collapseBtn.title = 'Collapse sidebar (Tab)';
    collapseBtn.style.cssText = this.sidebarBtnStyle();
    collapseBtn.addEventListener('click', () => this.toggleSidebar());

    header.appendChild(title);
    header.appendChild(collapseBtn);
    return header;
  }

  private buildSidebarSection(title: string, content: HTMLElement, collapsible = false): HTMLDivElement {
    const section = document.createElement('div');
    section.style.cssText = `border-bottom: 1px solid ${SIDEBAR_BORDER}; flex-shrink: 0;`;

    const headerRow = document.createElement('div');
    headerRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      color: ${SIDEBAR_SECTION_HEADER};
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      ${collapsible ? 'cursor: pointer;' : ''}
    `;

    const arrow = document.createElement('span');
    arrow.textContent = collapsible ? '\u25BC' : '';
    arrow.style.cssText = 'font-size: 9px; margin-right: 6px;';

    const label = document.createElement('span');
    label.textContent = title;

    const titleGroup = document.createElement('span');
    titleGroup.appendChild(arrow);
    titleGroup.appendChild(label);
    headerRow.appendChild(titleGroup);

    section.appendChild(headerRow);
    section.appendChild(content);

    if (collapsible) {
      headerRow.addEventListener('click', () => {
        const collapsed = content.style.display === 'none';
        content.style.display = collapsed ? '' : 'none';
        arrow.textContent = collapsed ? '\u25BC' : '\u25B6';
      });
    }

    return section;
  }

  private buildFileSection(): HTMLDivElement {
    const content = document.createElement('div');
    content.style.cssText = 'display: flex; gap: 4px; padding: 0 12px 6px;';

    const saveBtn = this.makeSidebarButton('Save', '\u2318S');
    saveBtn.addEventListener('click', () => this.saveMap());
    const openBtn = this.makeSidebarButton('Open', '\u2318O');
    openBtn.addEventListener('click', () => this.openMap());

    content.appendChild(saveBtn);
    content.appendChild(openBtn);
    return this.buildSidebarSection('File', content);
  }

  private buildToolSection(): HTMLDivElement {
    const content = document.createElement('div');
    content.style.cssText = 'display: flex; gap: 4px; padding: 0 12px 6px;';

    this.toolButtons = new Map();
    for (const tool of PAINT_TOOLS) {
      const btn = this.makeSidebarButton(tool.label, tool.shortcut);
      btn.addEventListener('click', () => this.selectTool(tool.mode));
      content.appendChild(btn);
      this.toolButtons.set(tool.mode, btn);
    }

    const section = this.buildSidebarSection('Tools', content);
    this.updateToolSelection(this.inputHandler.getToolMode());
    return section;
  }

  private buildLayerSection(): HTMLDivElement {
    const content = document.createElement('div');
    content.style.cssText = 'padding: 0 12px 6px; display: flex; flex-direction: column; gap: 4px;';

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 4px;';

    this.layerButtons = [];
    for (let i = 0; i < NUM_EDITABLE_LAYERS; i++) {
      const btn = this.makeSidebarButton(String(i + 1), String(i + 1));
      btn.addEventListener('click', () => this.setActiveLayer(i));
      row.appendChild(btn);
      this.layerButtons.push(btn);
    }

    content.appendChild(row);

    const visRow = document.createElement('div');
    visRow.style.cssText = 'display: flex; gap: 4px; align-items: center;';

    const visLabel = document.createElement('span');
    visLabel.textContent = 'Visibility:';
    visLabel.style.cssText = `color: ${SIDEBAR_SECTION_HEADER}; font-size: 11px;`;

    this.visibilityButton = this.makeSidebarButton(VISIBILITY_LABELS[this.visibilityMode], 'V');
    this.visibilityButton.addEventListener('click', () => this.cycleVisibility());

    visRow.appendChild(visLabel);
    visRow.appendChild(this.visibilityButton);
    content.appendChild(visRow);

    const section = this.buildSidebarSection('Layers', content);
    this.updateLayerSelection();
    return section;
  }

  private buildColorSection(wangSet: WangSet): HTMLDivElement {
    const content = document.createElement('div');
    content.style.cssText = 'padding: 0 12px 6px; display: flex; flex-direction: column; gap: 2px;';

    this.colorButtons = [];
    for (const color of wangSet.colors) {
      const btn = document.createElement('button');
      btn.dataset.colorId = String(color.id);
      btn.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: ${SIDEBAR_TEXT};
        font-family: system-ui, sans-serif;
        font-size: 13px;
        cursor: pointer;
        width: 100%;
        text-align: left;
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
        this.selectTool('brush');
        this.updateColorSelection(color.id);
      });

      content.appendChild(btn);
      this.colorButtons.push(btn);
    }

    const section = this.buildSidebarSection('Colors', content, true);
    this.updateColorSelection(this.inputHandler.getActiveColor());
    return section;
  }

  private buildPrefabSection(): HTMLDivElement {
    this.prefabListContainer = document.createElement('div');
    this.prefabListContainer.style.cssText = 'padding: 0 12px 6px; display: flex; flex-direction: column; gap: 2px;';

    return this.buildSidebarSection('Prefabs', this.prefabListContainer, true);
  }

  private rebuildPrefabList(): void {
    this.prefabListContainer.replaceChildren();
    this.prefabButtons = [];

    if (this.prefabs.length === 0) {
      const empty = document.createElement('span');
      empty.textContent = 'No prefabs loaded';
      empty.style.cssText = `color: ${SIDEBAR_SECTION_HEADER}; font-size: 12px; padding: 4px 0;`;
      this.prefabListContainer.appendChild(empty);
      return;
    }

    for (const prefab of this.prefabs) {
      const btn = document.createElement('button');
      btn.textContent = prefab.name;
      btn.style.cssText = `
        display: block;
        width: 100%;
        padding: 4px 8px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: ${SIDEBAR_TEXT};
        font-family: system-ui, sans-serif;
        font-size: 13px;
        cursor: pointer;
        text-align: left;
      `;
      btn.addEventListener('click', () => this.selectPrefab(prefab));
      this.prefabListContainer.appendChild(btn);
      this.prefabButtons.push(btn);
    }
  }

  // --- Selection helpers ---

  private selectTool(mode: ToolMode): void {
    if (mode !== 'prefab') {
      this.activePrefab = null;
      this.clearPrefabPreview();
      this.updatePrefabSelection();
    }
    this.inputHandler.setToolMode(mode);
    this.updateToolSelection(mode);
  }

  private selectPrefab(prefab: SavedPrefab): void {
    this.activePrefab = prefab;
    this.inputHandler.setToolMode('prefab');
    this.updateToolSelection('prefab');
    this.updatePrefabSelection();
  }

  private cancelPrefab(): void {
    if (this.activePrefab) {
      this.activePrefab = null;
      this.clearPrefabPreview();
      this.updatePrefabSelection();
      this.selectTool('brush');
    }
  }

  private toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.applySidebarLayout();
  }

  private applySidebarLayout(): void {
    const collapsed = this.sidebarCollapsed;
    this.sidebar.style.width = collapsed ? '0px' : `${SIDEBAR_WIDTH}px`;
    this.sidebar.style.overflow = collapsed ? 'hidden' : 'auto';
    this.expandBtn.style.display = collapsed ? '' : 'none';

    // Shift the Excalibur canvas so the sidebar doesn't cover it
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.style.marginLeft = collapsed ? '0' : `${SIDEBAR_WIDTH}px`;
    }
  }

  // --- UI update helpers ---

  private updateToolSelection(activeMode: ToolMode): void {
    if (!this.toolButtons) return;
    for (const [mode, btn] of this.toolButtons) {
      setButtonActive(btn, mode === activeMode);
    }
  }

  private updateLayerSelection(): void {
    for (let i = 0; i < this.layerButtons.length; i++) {
      setButtonActive(this.layerButtons[i], i === this.activeLayerIndex);
    }
  }

  private updateColorSelection(activeColor: number): void {
    for (const btn of this.colorButtons) {
      setButtonActive(btn, Number(btn.dataset.colorId) === activeColor);
    }
  }

  private updatePrefabSelection(): void {
    for (let i = 0; i < this.prefabButtons.length; i++) {
      setButtonActive(this.prefabButtons[i], this.prefabs[i] === this.activePrefab);
    }
  }

  // --- Prefab tile iteration ---

  /**
   * Iterate over all in-bounds tiles of a prefab placed at (anchorTileX, anchorTileY)
   * starting from baseLayer. Calls fn with (mapX, mapY, targetLayer, tile) for each.
   */
  private forEachPrefabTile(
    prefab: SavedPrefab,
    anchorTileX: number,
    anchorTileY: number,
    baseLayer: number,
    fn: (mapX: number, mapY: number, targetLayer: number, tile: PrefabTile) => void,
  ): void {
    const baseX = anchorTileX - prefab.anchorX;
    const baseY = anchorTileY - prefab.anchorY;

    for (let i = 0; i < NUM_PREFAB_LAYERS; i++) {
      const targetLayer = baseLayer + i;
      if (targetLayer >= NUM_MAP_LAYERS) break;

      const prefabTiles = prefab.layers[i];
      if (!prefabTiles) continue;

      for (const tile of prefabTiles) {
        const mapX = baseX + tile.x;
        const mapY = baseY + tile.y;
        if (mapX < 0 || mapX >= MAP_COLS || mapY < 0 || mapY >= MAP_ROWS) continue;
        fn(mapX, mapY, targetLayer, tile);
      }
    }
  }

  // --- Prefab preview ---

  private updatePrefabPreview(pos: [number, number] | null): void {
    this.clearPrefabPreview();

    if (!this.activePrefab || !pos) return;

    this.forEachPrefabTile(this.activePrefab, pos[0], pos[1], this.activeLayerIndex,
      (mapX, mapY, targetLayer, tile) => {
        const previewIndex = targetLayer - this.activeLayerIndex;
        this.previewLayers[previewIndex].placeCell(mapX, mapY, cellFromPrefabTile(tile));
        this.previewedCells.push({ layer: previewIndex, x: mapX, y: mapY });
      },
    );
  }

  private clearPrefabPreview(): void {
    for (const { layer, x, y } of this.previewedCells) {
      this.previewLayers[layer].clearCell(x, y);
    }
    this.previewedCells = [];
  }

  // --- Prefab placement ---

  private placePrefab(tileX: number, tileY: number): void {
    if (!this.activePrefab) return;

    const ref: PlacedPrefab = {
      prefabName: this.activePrefab.name,
      x: tileX,
      y: tileY,
      layer: this.activeLayerIndex,
    };

    const previousCells: CellSnapshot[] = [];

    this.forEachPrefabTile(this.activePrefab, tileX, tileY, this.activeLayerIndex,
      (mapX, mapY, targetLayer, tile) => {
        previousCells.push({
          layer: targetLayer, x: mapX, y: mapY,
          cell: this.layers[targetLayer].autoMap.cellAt(mapX, mapY),
        });
        this.layers[targetLayer].placeCell(mapX, mapY, cellFromPrefabTile(tile));
      },
    );

    this.prefabUndoStack.push({ ref, previousCells });
    this.prefabRedoStack.length = 0;
    this.placedPrefabs.push(ref);
    this.scheduleAutosave();
  }

  /**
   * Swap cell snapshots: capture current state, restore the entry's cells,
   * and return a new entry with the captured state.
   */
  private swapCellSnapshots(entry: PrefabUndoEntry): PrefabUndoEntry {
    const capturedCells: CellSnapshot[] = [];
    for (const { layer, x, y } of entry.previousCells) {
      capturedCells.push({ layer, x, y, cell: this.layers[layer].autoMap.cellAt(x, y) });
    }

    for (const { layer, x, y, cell } of entry.previousCells) {
      if (cell.tileId < 0) {
        this.layers[layer].clearCell(x, y);
      } else {
        this.layers[layer].placeCell(x, y, cell);
      }
    }

    return { ref: entry.ref, previousCells: capturedCells };
  }

  private undoPrefab(): void {
    const entry = this.prefabUndoStack.pop();
    if (!entry) return;

    this.prefabRedoStack.push(this.swapCellSnapshots(entry));

    const idx = this.placedPrefabs.indexOf(entry.ref);
    if (idx >= 0) this.placedPrefabs.splice(idx, 1);
    this.scheduleAutosave();
  }

  private redoPrefab(): void {
    const entry = this.prefabRedoStack.pop();
    if (!entry) return;

    this.prefabUndoStack.push(this.swapCellSnapshots(entry));
    this.placedPrefabs.push(entry.ref);
    this.scheduleAutosave();
  }

  // --- Animations ---

  onPreUpdate(_engine: ex.Engine, delta: number): void {
    for (const layer of this.layers) {
      layer.updateAnimations(delta);
    }
  }

  // --- Autosave ---

  private createSaveIndicator(): void {
    this.saveIndicator = document.createElement('div');
    this.saveIndicator.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(30, 30, 50, 0.9);
      color: ${SIDEBAR_TEXT};
      padding: 4px 10px;
      border-radius: 4px;
      font-family: system-ui, sans-serif;
      font-size: 11px;
      z-index: 200;
      display: none;
      transition: opacity 0.3s;
    `;
    document.body.appendChild(this.saveIndicator);
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

  private scheduleAutosave(): void {
    if (!this.currentMapName) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.autosave(), 5000);
  }

  // --- Save / Load ---

  private toSavedMap(): SavedMap {
    return {
      version: 2,
      name: this.currentMapName!,
      wangSetName: this.currentWangSet.name,
      width: MAP_COLS,
      height: MAP_ROWS,
      layers: this.layers.map(l => l.autoMap.getColors()),
      placedPrefabs: this.placedPrefabs.length > 0 ? this.placedPrefabs : undefined,
    };
  }

  private async postMap(): Promise<void> {
    const filename = `${this.currentMapName}.json`;
    const resp = await fetch('/api/save-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data: this.toSavedMap() }),
    });
    if (!resp.ok) throw new Error(await resp.text());
  }

  private async autosave(): Promise<void> {
    this.saveTimer = null;
    if (!this.currentMapName) return;

    this.showIndicator('Saving...');
    try {
      await this.postMap();
      console.log(`[map] Autosaved: ${this.currentMapName}`);
      this.showIndicator('Saved', 2000);
    } catch (err) {
      console.error('[map] Autosave failed:', err);
      this.showIndicator('Save failed!', 5000);
    }
  }

  async saveMap(): Promise<void> {
    if (!this.currentMapName) {
      const name = prompt('Map name:');
      if (!name) return;
      this.currentMapName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    }

    try {
      await this.postMap();
      this.updateHash();
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
    const raw = await resp.json();
    const saved = parseSavedMap(raw);

    const wangSet = this.findWangSetByName(saved.wangSetName);
    if (!wangSet) {
      throw new Error(`WangSet "${saved.wangSetName}" not found in project metadata`);
    }

    // Load each layer's colors
    for (let i = 0; i < NUM_MAP_LAYERS; i++) {
      this.layers[i].loadColors(saved.layers[i], wangSet);
    }

    // Restore placed prefabs
    this.placedPrefabs = [];
    this.prefabUndoStack = [];
    this.prefabRedoStack = [];
    for (const ref of saved.placedPrefabs ?? []) {
      const prefab = this.prefabs.find(p => p.name === ref.prefabName);
      if (!prefab) continue;

      this.forEachPrefabTile(prefab, ref.x, ref.y, ref.layer,
        (mapX, mapY, targetLayer, tile) => {
          this.layers[targetLayer].placeCell(mapX, mapY, cellFromPrefabTile(tile));
        },
      );
      this.placedPrefabs.push(ref);
    }

    this.currentMapName = saved.name;
    this.currentWangSet = wangSet;
    this.updateHash();
    console.log(`[map] Loaded: ${saved.name}`);
  }

  private findWangSetByName(name: string): WangSet | undefined {
    return this.tilesetManager.wangSets.find(ws => ws.name === name);
  }

  private updateHash(): void {
    const parts: string[] = [];
    if (this.currentMapName) parts.push(`map=${encodeURIComponent(this.currentMapName)}`);
    if (this.activeLayerIndex > 0) parts.push(`layer=${this.activeLayerIndex + 1}`);
    window.location.hash = parts.join('&');
  }

  // --- Shared helpers ---

  private makeSidebarButton(label: string, shortcut: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: ${SIDEBAR_TEXT};
      font-family: system-ui, sans-serif;
      font-size: 13px;
      cursor: pointer;
      height: 28px;
    `;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;

    const kbd = document.createElement('kbd');
    kbd.textContent = shortcut;
    kbd.style.cssText = `
      font-family: system-ui, sans-serif;
      font-size: 11px;
      color: #888;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
      padding: 1px 5px;
    `;

    btn.appendChild(labelSpan);
    btn.appendChild(kbd);
    return btn;
  }

  private sidebarBtnStyle(): string {
    return `
      border: none;
      background: transparent;
      color: ${SIDEBAR_TEXT};
      cursor: pointer;
      font-size: 14px;
      padding: 2px 6px;
      border-radius: 3px;
    `;
  }

  onDeactivate(): void {
    this.sidebar?.remove();
    this.expandBtn?.remove();
    this.saveIndicator?.remove();
  }
}
