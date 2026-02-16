import { TilesetMetadata, WangSetData, WangTileData } from '../core/metadata-schema.js';

export type EditorEvent =
  | 'selectedTileChanged'
  | 'activeWangSetChanged'
  | 'activeColorChanged'
  | 'metadataChanged'
  | 'zoomChanged';

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
  private listeners = new Map<EditorEvent, Set<Listener>>();

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
      ws.wangtiles.splice(idx, 1);
      this.emit('metadataChanged');
    }
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
