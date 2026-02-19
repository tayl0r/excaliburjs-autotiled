import type { ProjectMetadata } from '../core/metadata-schema.js';
import { type SavedPrefab, type PrefabTile } from '../core/prefab-schema.js';
import { NUM_PREFAB_LAYERS, type LayerVisibility } from '../core/layers.js';
import { UndoManager } from '../editor/undo-manager.js';

export type PrefabTool = 'paint' | 'erase' | 'anchor' | 'move' | 'copy';

export type PrefabEvent =
  | 'prefabListChanged'
  | 'activePrefabChanged'
  | 'prefabDataChanged'
  | 'tileSelectionChanged'
  | 'activeTilesetChanged'
  | 'toolChanged'
  | 'zoomChanged'
  | 'activeLayerChanged'
  | 'visibilityChanged';

const CANVAS_EXPAND_STEP = 10;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

function ceilToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/** Find the index of a tile at (x, y), or -1 if not found */
function findTileIndex(tiles: PrefabTile[], x: number, y: number): number {
  return tiles.findIndex(t => t.x === x && t.y === y);
}

/** Create an array of empty layers for a new prefab */
function emptyLayers(): PrefabTile[][] {
  return Array.from({ length: NUM_PREFAB_LAYERS }, () => []);
}

/** Compute bounding box of tiles across all layers; returns null if no tiles */
function allLayerBounds(layers: PrefabTile[][]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const layer of layers) {
    for (const t of layer) {
      if (t.x < minX) minX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.x > maxX) maxX = t.x;
      if (t.y > maxY) maxY = t.y;
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

type Listener = () => void;

export class PrefabEditorState {
  private _prefabs = new Map<string, SavedPrefab>();
  private _activePrefabName: string | null = null;
  private _selectedTileIds: number[] = [];
  private _activeTilesetIndex = 0;
  private _tool: PrefabTool = 'paint';
  private _copiedStamp: PrefabTile[] = [];
  private _tilesetZoom = 2;
  private _prefabZoom = 2;
  private _canvasWidth = 16;
  private _canvasHeight = 16;
  private _metadata: ProjectMetadata;
  private _activeLayer = 0;
  private _visibilityMode: LayerVisibility = 'all';
  private listeners = new Map<PrefabEvent, Set<Listener>>();
  private undoManager = new UndoManager<SavedPrefab>();

  constructor(metadata: ProjectMetadata) {
    this._metadata = metadata;
  }

  // --- Getters ---

  get prefabs(): ReadonlyMap<string, SavedPrefab> { return this._prefabs; }
  get activePrefabName(): string | null { return this._activePrefabName; }
  get activePrefab(): SavedPrefab | undefined {
    return this._activePrefabName ? this._prefabs.get(this._activePrefabName) : undefined;
  }
  get selectedTileIds(): readonly number[] { return this._selectedTileIds; }
  get activeTilesetIndex(): number { return this._activeTilesetIndex; }
  get tool(): PrefabTool { return this._tool; }
  get copiedStamp(): readonly PrefabTile[] { return this._copiedStamp; }
  get tilesetZoom(): number { return this._tilesetZoom; }
  get prefabZoom(): number { return this._prefabZoom; }
  get metadata(): ProjectMetadata { return this._metadata; }

  get canvasWidth(): number { return this._canvasWidth; }
  get canvasHeight(): number { return this._canvasHeight; }

  get prefabWidth(): number {
    const bounds = this.activePrefab ? allLayerBounds(this.activePrefab.layers) : null;
    return bounds ? bounds.maxX - bounds.minX + 1 : 0;
  }
  get prefabHeight(): number {
    const bounds = this.activePrefab ? allLayerBounds(this.activePrefab.layers) : null;
    return bounds ? bounds.maxY - bounds.minY + 1 : 0;
  }

  get activeLayer(): number { return this._activeLayer; }
  get visibilityMode(): LayerVisibility { return this._visibilityMode; }

  /** Get tiles on the active layer of the active prefab */
  get activeLayerTiles(): PrefabTile[] {
    const prefab = this.activePrefab;
    if (!prefab) return [];
    return prefab.layers[this._activeLayer];
  }

  get activeTileset() {
    return this._metadata.tilesets[this._activeTilesetIndex];
  }
  get columns(): number { return this.activeTileset.columns; }
  get tileCount(): number { return this.activeTileset.tileCount; }
  get tileWidth(): number { return this.activeTileset.tileWidth; }
  get tileHeight(): number { return this.activeTileset.tileHeight; }

  // --- Layer ---

  setActiveLayer(index: number): void {
    if (index < 0 || index >= NUM_PREFAB_LAYERS) return;
    if (this._activeLayer === index) return;
    this._activeLayer = index;
    this.emit('activeLayerChanged');
  }

  cycleVisibility(): void {
    const modes: LayerVisibility[] = ['all', 'highlight', 'hidden'];
    const idx = modes.indexOf(this._visibilityMode);
    this._visibilityMode = modes[(idx + 1) % modes.length];
    this.emit('visibilityChanged');
  }

  // --- Prefab CRUD ---

  loadPrefabs(prefabs: SavedPrefab[]): void {
    this._prefabs.clear();
    for (const p of prefabs) {
      this._prefabs.set(p.name, p);
    }
    // Auto-select the first prefab
    const first = this._prefabs.keys().next();
    this._activePrefabName = first.done ? null : first.value;
    this.fitCanvasToPrefab();
    this.emit('prefabListChanged');
    this.emit('activePrefabChanged');
  }

  createPrefab(name: string): void {
    if (this._prefabs.has(name)) return;
    const prefab: SavedPrefab = {
      version: 2,
      name,
      layers: emptyLayers(),
      anchorX: 0,
      anchorY: 0,
    };
    this._prefabs.set(name, prefab);
    this._activePrefabName = name;
    this.emit('prefabListChanged');
    this.emit('activePrefabChanged');
  }

  duplicatePrefab(sourceName: string): void {
    const source = this._prefabs.get(sourceName);
    if (!source) return;
    let n = 1;
    let name = `${sourceName} Copy`;
    while (this._prefabs.has(name)) {
      n++;
      name = `${sourceName} Copy ${n}`;
    }
    const prefab: SavedPrefab = {
      ...source,
      name,
      layers: source.layers.map(layer => layer.map(t => ({ ...t }))),
    };
    this._prefabs.set(name, prefab);
    this._activePrefabName = name;
    this.emit('prefabListChanged');
    this.emit('activePrefabChanged');
  }

  deletePrefab(name: string): void {
    if (!this._prefabs.has(name)) return;
    this._prefabs.delete(name);
    if (this._activePrefabName === name) {
      const first = this._prefabs.keys().next();
      this._activePrefabName = first.done ? null : first.value;
      this.emit('activePrefabChanged');
    }
    this.emit('prefabListChanged');
  }

  renamePrefab(oldName: string, newName: string): void {
    const prefab = this._prefabs.get(oldName);
    if (!prefab || this._prefabs.has(newName)) return;
    this._prefabs.delete(oldName);
    prefab.name = newName;
    this._prefabs.set(newName, prefab);
    if (this._activePrefabName === oldName) {
      this._activePrefabName = newName;
    }
    this.emit('prefabListChanged');
  }

  setActivePrefab(name: string): void {
    if (this._activePrefabName === name) return;
    if (!this._prefabs.has(name)) return;
    this._activePrefabName = name;
    this.fitCanvasToPrefab();
    this.emit('activePrefabChanged');
  }

  private fitCanvasToPrefab(): void {
    const prefab = this.activePrefab;
    if (!prefab) return;
    const bounds = allLayerBounds(prefab.layers);
    if (!bounds) return;
    this._canvasWidth = Math.max(this._canvasWidth, ceilToStep(bounds.maxX + 1, CANVAS_EXPAND_STEP));
    this._canvasHeight = Math.max(this._canvasHeight, ceilToStep(bounds.maxY + 1, CANVAS_EXPAND_STEP));
  }

  // --- Undo/Redo ---

  private saveSnapshot(): void {
    const prefab = this.activePrefab;
    if (prefab) this.undoManager.pushSnapshot(prefab);
  }

  undo(): void {
    const prefab = this.activePrefab;
    if (!prefab) return;
    const snapshot = this.undoManager.undo(prefab);
    if (!snapshot) return;
    this._prefabs.set(snapshot.name, snapshot);
    this.emit('prefabDataChanged');
  }

  redo(): void {
    const prefab = this.activePrefab;
    if (!prefab) return;
    const snapshot = this.undoManager.redo(prefab);
    if (!snapshot) return;
    this._prefabs.set(snapshot.name, snapshot);
    this.emit('prefabDataChanged');
  }

  // --- Tile placement (operates on active layer) ---

  placeTiles(tiles: PrefabTile[]): void {
    const prefab = this.activePrefab;
    if (!prefab) return;
    this.saveSnapshot();
    const layerTiles = prefab.layers[this._activeLayer];
    for (const tile of tiles) {
      const idx = findTileIndex(layerTiles, tile.x, tile.y);
      if (idx >= 0) layerTiles[idx] = tile;
      else layerTiles.push(tile);
    }
    this.emit('prefabDataChanged');
  }

  eraseTile(x: number, y: number): void {
    const prefab = this.activePrefab;
    if (!prefab) return;
    const layerTiles = prefab.layers[this._activeLayer];
    const idx = findTileIndex(layerTiles, x, y);
    if (idx < 0) return;
    this.saveSnapshot();
    layerTiles.splice(idx, 1);
    this.emit('prefabDataChanged');
  }

  setAnchor(x: number, y: number): void {
    const prefab = this.activePrefab;
    if (!prefab) return;
    this.saveSnapshot();
    prefab.anchorX = x;
    prefab.anchorY = y;
    this._tool = 'paint';
    this.emit('prefabDataChanged');
    this.emit('toolChanged');
  }

  moveTiles(tiles: PrefabTile[], dx: number, dy: number): void {
    const prefab = this.activePrefab;
    if (!prefab) return;
    this.saveSnapshot();
    const layerTiles = prefab.layers[this._activeLayer];
    // Remove tiles at old positions
    for (const t of tiles) {
      const idx = findTileIndex(layerTiles, t.x, t.y);
      if (idx >= 0) layerTiles.splice(idx, 1);
    }
    // Place tiles at new positions
    for (const t of tiles) {
      const newTile = { ...t, x: t.x + dx, y: t.y + dy };
      const idx = findTileIndex(layerTiles, newTile.x, newTile.y);
      if (idx >= 0) layerTiles[idx] = newTile;
      else layerTiles.push(newTile);
    }
    this.emit('prefabDataChanged');
  }

  setCopiedStamp(tiles: PrefabTile[]): void {
    if (tiles.length === 0) return;
    // Normalize positions so top-left is (0,0)
    let minX = Infinity, minY = Infinity;
    for (const t of tiles) {
      if (t.x < minX) minX = t.x;
      if (t.y < minY) minY = t.y;
    }
    this._copiedStamp = tiles.map(t => ({ ...t, x: t.x - minX, y: t.y - minY }));
    this._tool = 'paint';
    this.emit('toolChanged');
  }

  expandCanvas(): void {
    this._canvasWidth += CANVAS_EXPAND_STEP;
    this._canvasHeight += CANVAS_EXPAND_STEP;
    this.emit('prefabDataChanged');
  }

  // --- Tileset selection ---

  selectTile(id: number): void {
    this._selectedTileIds = [id];
    this.commitTileSelection();
  }

  selectTileRange(from: number, to: number): void {
    const columns = this.columns;
    const fromCol = from % columns;
    const fromRow = Math.floor(from / columns);
    const toCol = to % columns;
    const toRow = Math.floor(to / columns);

    const minCol = Math.min(fromCol, toCol);
    const maxCol = Math.max(fromCol, toCol);
    const minRow = Math.min(fromRow, toRow);
    const maxRow = Math.max(fromRow, toRow);

    const ids: number[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const id = r * columns + c;
        if (id < this.tileCount) ids.push(id);
      }
    }
    this._selectedTileIds = ids;
    this.commitTileSelection();
  }

  toggleTileSelection(id: number): void {
    const idx = this._selectedTileIds.indexOf(id);
    if (idx >= 0) {
      this._selectedTileIds = this._selectedTileIds.filter((_, i) => i !== idx);
    } else {
      this._selectedTileIds = [...this._selectedTileIds, id];
    }
    this.commitTileSelection();
  }

  private commitTileSelection(): void {
    this._copiedStamp = [];
    if (this._tool !== 'paint') {
      this._tool = 'paint';
      this.emit('toolChanged');
    }
    this.emit('tileSelectionChanged');
  }

  // --- Tool & zoom ---

  setTool(tool: PrefabTool): void {
    if (this._tool === tool) return;
    this._tool = tool;
    this.emit('toolChanged');
  }

  resetTool(): void {
    this._selectedTileIds = [];
    this._copiedStamp = [];
    this._tool = 'paint';
    this.emit('tileSelectionChanged');
    this.emit('toolChanged');
  }

  setActiveTileset(index: number): void {
    if (this._activeTilesetIndex === index) return;
    if (index < 0 || index >= this._metadata.tilesets.length) return;
    this._activeTilesetIndex = index;
    this._selectedTileIds = [];
    this.emit('activeTilesetChanged');
    this.emit('tileSelectionChanged');
  }

  setTilesetZoom(zoom: number): void {
    const clamped = clampZoom(zoom);
    if (clamped === this._tilesetZoom) return;
    this._tilesetZoom = clamped;
    this.emit('zoomChanged');
  }

  setPrefabZoom(zoom: number): void {
    const clamped = clampZoom(zoom);
    if (clamped === this._prefabZoom) return;
    this._prefabZoom = clamped;
    this.emit('zoomChanged');
  }

  // --- Pub/Sub ---

  on(event: PrefabEvent, listener: Listener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: PrefabEvent, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: PrefabEvent): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const fn of listeners) fn();
    }
  }
}
