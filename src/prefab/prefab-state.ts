import type { ProjectMetadata } from '../core/metadata-schema.js';
import type { SavedPrefab, PrefabTile } from '../core/prefab-schema.js';
import { UndoManager } from '../editor/undo-manager.js';

export type PrefabTool = 'paint' | 'erase' | 'anchor' | 'move' | 'copy';

export type PrefabEvent =
  | 'prefabListChanged'
  | 'activePrefabChanged'
  | 'prefabDataChanged'
  | 'tileSelectionChanged'
  | 'activeTilesetChanged'
  | 'toolChanged'
  | 'zoomChanged';

const CANVAS_EXPAND_STEP = 10;

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

  /** Prefab dimensions: rightmost - leftmost + 1, bottommost - topmost + 1 */
  get prefabWidth(): number {
    const prefab = this.activePrefab;
    if (!prefab || prefab.tiles.length === 0) return 0;
    let min = Infinity, max = -Infinity;
    for (const t of prefab.tiles) { if (t.x < min) min = t.x; if (t.x > max) max = t.x; }
    return max - min + 1;
  }
  get prefabHeight(): number {
    const prefab = this.activePrefab;
    if (!prefab || prefab.tiles.length === 0) return 0;
    let min = Infinity, max = -Infinity;
    for (const t of prefab.tiles) { if (t.y < min) min = t.y; if (t.y > max) max = t.y; }
    return max - min + 1;
  }

  get activeTileset() {
    return this._metadata.tilesets[this._activeTilesetIndex];
  }
  get columns(): number { return this.activeTileset.columns; }
  get tileCount(): number { return this.activeTileset.tileCount; }
  get tileWidth(): number { return this.activeTileset.tileWidth; }
  get tileHeight(): number { return this.activeTileset.tileHeight; }

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
      version: 1,
      name,
      tiles: [],
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
    const prefab = {
      ...source,
      name,
      tiles: source.tiles.map(t => ({ ...t })),
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
    if (!prefab || prefab.tiles.length === 0) return;
    let maxX = 0, maxY = 0;
    for (const t of prefab.tiles) {
      if (t.x + 1 > maxX) maxX = t.x + 1;
      if (t.y + 1 > maxY) maxY = t.y + 1;
    }
    while (this._canvasWidth < maxX) this._canvasWidth += CANVAS_EXPAND_STEP;
    while (this._canvasHeight < maxY) this._canvasHeight += CANVAS_EXPAND_STEP;
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

  // --- Tile placement ---

  placeTiles(tiles: PrefabTile[]): void {
    const prefab = this.activePrefab;
    if (!prefab) return;
    this.saveSnapshot();
    for (const tile of tiles) {
      const idx = prefab.tiles.findIndex(t => t.x === tile.x && t.y === tile.y);
      if (idx >= 0) {
        prefab.tiles[idx] = tile;
      } else {
        prefab.tiles.push(tile);
      }
    }
    this.emit('prefabDataChanged');
  }

  eraseTile(x: number, y: number): void {
    const prefab = this.activePrefab;
    if (!prefab) return;
    const idx = prefab.tiles.findIndex(t => t.x === x && t.y === y);
    if (idx >= 0) {
      this.saveSnapshot();
      prefab.tiles.splice(idx, 1);
      this.emit('prefabDataChanged');
    }
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
    // Remove tiles at old positions
    for (const t of tiles) {
      const idx = prefab.tiles.findIndex(p => p.x === t.x && p.y === t.y);
      if (idx >= 0) prefab.tiles.splice(idx, 1);
    }
    // Place tiles at new positions
    for (const t of tiles) {
      const newTile = { ...t, x: t.x + dx, y: t.y + dy };
      const idx = prefab.tiles.findIndex(p => p.x === newTile.x && p.y === newTile.y);
      if (idx >= 0) prefab.tiles[idx] = newTile;
      else prefab.tiles.push(newTile);
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
    this._copiedStamp = [];
    if (this._tool !== 'paint') {
      this._tool = 'paint';
      this.emit('toolChanged');
    }
    this.emit('tileSelectionChanged');
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
    this._copiedStamp = [];
    if (this._tool !== 'paint') {
      this._tool = 'paint';
      this.emit('toolChanged');
    }
    this.emit('tileSelectionChanged');
  }

  toggleTileSelection(id: number): void {
    const idx = this._selectedTileIds.indexOf(id);
    if (idx >= 0) {
      this._selectedTileIds = this._selectedTileIds.filter((_, i) => i !== idx);
    } else {
      this._selectedTileIds = [...this._selectedTileIds, id];
    }
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
    const clamped = Math.max(1, Math.min(8, zoom));
    if (clamped === this._tilesetZoom) return;
    this._tilesetZoom = clamped;
    this.emit('zoomChanged');
  }

  setPrefabZoom(zoom: number): void {
    const clamped = Math.max(1, Math.min(8, zoom));
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
