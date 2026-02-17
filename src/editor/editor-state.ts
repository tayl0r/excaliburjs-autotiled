import { TilesetMetadata, WangSetData, WangTileData } from '../core/metadata-schema.js';
import { UndoManager } from './undo-manager.js';

export type EditorEvent =
  | 'selectedTileChanged'
  | 'activeWangSetChanged'
  | 'activeColorChanged'
  | 'metadataChanged'
  | 'zoomChanged'
  | 'templateModeChanged'
  | 'templateSlotChanged';

type Listener = () => void;

/**
 * Centralized editor state with pub/sub for panel coordination.
 */
export class EditorState {
  private _selectedTileId: number = -1;
  private _activeWangSetIndex: number = 0;
  private _activeColorId: number = 1;
  private _metadata: TilesetMetadata;
  private _zoom: number = 2;
  private _templateMode = false;
  private _activeTemplateSlot = -1;
  private _templateColorA: number = 1;
  private _templateColorB: number = 2;
  private listeners = new Map<EditorEvent, Set<Listener>>();
  private undoManager = new UndoManager();

  constructor(metadata: TilesetMetadata) {
    this._metadata = metadata;
  }

  // --- Getters ---

  get selectedTileId(): number {
    return this._selectedTileId;
  }

  get activeWangSetIndex(): number {
    return this._activeWangSetIndex;
  }

  get activeColorId(): number {
    return this._activeColorId;
  }

  get metadata(): TilesetMetadata {
    return this._metadata;
  }

  get zoom(): number {
    return this._zoom;
  }

  get activeWangSet(): WangSetData | undefined {
    return this._metadata.wangsets[this._activeWangSetIndex];
  }

  get templateMode(): boolean {
    return this._templateMode;
  }

  get activeTemplateSlot(): number {
    return this._activeTemplateSlot;
  }

  get templateColorA(): number {
    return this._templateColorA;
  }

  get templateColorB(): number {
    return this._templateColorB;
  }

  // --- Setters (emit events) ---

  selectTile(tileId: number): void {
    if (this._selectedTileId === tileId) return;
    this._selectedTileId = tileId;
    this.emit('selectedTileChanged');
  }

  setActiveWangSet(index: number): void {
    if (this._activeWangSetIndex === index) return;
    this._activeWangSetIndex = index;
    this.emit('activeWangSetChanged');
  }

  setActiveColor(colorId: number): void {
    if (this._activeColorId === colorId) return;
    this._activeColorId = colorId;
    this.emit('activeColorChanged');
  }

  setZoom(zoom: number): void {
    this._zoom = Math.max(1, Math.min(8, zoom));
    this.emit('zoomChanged');
  }

  setTemplateMode(on: boolean): void {
    if (this._templateMode === on) return;
    this._templateMode = on;
    if (!on) this._activeTemplateSlot = -1;
    this.emit('templateModeChanged');
  }

  setActiveTemplateSlot(slot: number): void {
    if (this._activeTemplateSlot === slot) return;
    this._activeTemplateSlot = slot;
    this.emit('templateSlotChanged');
  }

  setTemplateColorA(colorId: number): void {
    if (this._templateColorA === colorId) return;
    this._templateColorA = colorId;
    this.emit('templateModeChanged');
  }

  setTemplateColorB(colorId: number): void {
    if (this._templateColorB === colorId) return;
    this._templateColorB = colorId;
    this.emit('templateModeChanged');
  }

  // --- Undo/Redo ---

  private saveSnapshot(): void {
    this.undoManager.pushSnapshot(this._metadata);
  }

  undo(): void {
    const prev = this.undoManager.undo(this._metadata);
    if (prev) {
      this._metadata = prev;
      // Clamp active WangSet index
      if (this._activeWangSetIndex >= this._metadata.wangsets.length) {
        this._activeWangSetIndex = Math.max(0, this._metadata.wangsets.length - 1);
      }
      this.emit('metadataChanged');
      this.emit('activeWangSetChanged');
    }
  }

  redo(): void {
    const next = this.undoManager.redo(this._metadata);
    if (next) {
      this._metadata = next;
      if (this._activeWangSetIndex >= this._metadata.wangsets.length) {
        this._activeWangSetIndex = Math.max(0, this._metadata.wangsets.length - 1);
      }
      this.emit('metadataChanged');
      this.emit('activeWangSetChanged');
    }
  }

  // --- Metadata mutation ---

  /** Get the WangTile data for a tile ID in the active WangSet, if it exists */
  getWangTile(tileId: number): WangTileData | undefined {
    const ws = this.activeWangSet;
    if (!ws) return undefined;
    return ws.wangtiles.find(wt => wt.tileid === tileId);
  }

  /** Set or update the WangId for a tile in the active WangSet */
  setWangId(tileId: number, wangid: number[]): void {
    const ws = this.activeWangSet;
    if (!ws) return;
    this.saveSnapshot();

    const existing = ws.wangtiles.find(wt => wt.tileid === tileId);
    if (existing) {
      existing.wangid = [...wangid];
    } else {
      ws.wangtiles.push({ tileid: tileId, wangid: [...wangid] });
    }
    this.emit('metadataChanged');
  }

  /** Remove a tile's WangId mapping from the active WangSet */
  removeWangTile(tileId: number): void {
    const ws = this.activeWangSet;
    if (!ws) return;

    const idx = ws.wangtiles.findIndex(wt => wt.tileid === tileId);
    if (idx >= 0) {
      this.saveSnapshot();
      ws.wangtiles.splice(idx, 1);
      this.emit('metadataChanged');
    }
  }

  /** Add a new WangSet and select it */
  addWangSet(name: string, type: 'corner' | 'edge' | 'mixed'): void {
    this.saveSnapshot();
    this._metadata.wangsets.push({
      name,
      type,
      tile: -1,
      colors: [],
      wangtiles: [],
    });
    this._activeWangSetIndex = this._metadata.wangsets.length - 1;
    this.emit('activeWangSetChanged');
    this.emit('metadataChanged');
  }

  /** Remove a WangSet by index and adjust selection */
  removeWangSet(index: number): void {
    if (index < 0 || index >= this._metadata.wangsets.length) return;
    this.saveSnapshot();
    const prevIndex = this._activeWangSetIndex;
    this._metadata.wangsets.splice(index, 1);
    if (this._activeWangSetIndex >= this._metadata.wangsets.length) {
      this._activeWangSetIndex = Math.max(0, this._metadata.wangsets.length - 1);
    }
    if (this._activeWangSetIndex !== prevIndex || index <= prevIndex) {
      this.emit('activeWangSetChanged');
    }
    this.emit('metadataChanged');
  }

  /** Rename a WangSet by index */
  renameWangSet(index: number, name: string): void {
    const ws = this._metadata.wangsets[index];
    if (!ws) return;
    this.saveSnapshot();
    ws.name = name;
    this.emit('metadataChanged');
  }

  /** Add a new color to the active WangSet */
  addColor(name: string, color: string): void {
    const ws = this.activeWangSet;
    if (!ws) return;
    this.saveSnapshot();
    ws.colors.push({ name, color, probability: 1.0, tile: -1 });
    this.emit('metadataChanged');
  }

  /** Update properties of a color in the active WangSet */
  updateColor(colorIndex: number, updates: Partial<{ name: string; color: string; probability: number; tile: number }>): void {
    const ws = this.activeWangSet;
    if (!ws || !ws.colors[colorIndex]) return;
    this.saveSnapshot();
    Object.assign(ws.colors[colorIndex], updates);
    this.emit('metadataChanged');
  }

  /** Remove a color from the active WangSet and shift wangid references */
  removeColor(colorIndex: number): void {
    const ws = this.activeWangSet;
    if (!ws || !ws.colors[colorIndex]) return;
    this.saveSnapshot();

    const removedId = colorIndex + 1; // colors are 1-based in WangIds
    ws.colors.splice(colorIndex, 1);

    // Shift wangid references: removed -> 0, above removed -> decrement
    for (const wt of ws.wangtiles) {
      for (let i = 0; i < wt.wangid.length; i++) {
        if (wt.wangid[i] === removedId) {
          wt.wangid[i] = 0;
        } else if (wt.wangid[i] > removedId) {
          wt.wangid[i]--;
        }
      }
    }

    // Clamp active color
    if (this._activeColorId > ws.colors.length) {
      this._activeColorId = ws.colors.length === 0 ? 0 : ws.colors.length;
      this.emit('activeColorChanged');
    }

    this.emit('metadataChanged');
  }

  /** Replace the entire metadata (e.g., after loading from file) */
  setMetadata(metadata: TilesetMetadata): void {
    this._metadata = metadata;
    this._activeWangSetIndex = 0;
    this._selectedTileId = -1;
    this.emit('metadataChanged');
    this.emit('activeWangSetChanged');
    this.emit('selectedTileChanged');
  }

  // --- Pub/Sub ---

  on(event: EditorEvent, listener: Listener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: EditorEvent, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: EditorEvent): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const fn of listeners) {
        fn();
      }
    }
  }
}
