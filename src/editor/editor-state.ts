import { ProjectMetadata, TilesetDef, WangSetData, WangTileData, TransformationConfig, DEFAULT_TRANSFORMATIONS, AnimationData, AnimationFrameData } from '../core/metadata-schema.js';
import { wangColorHex } from '../core/wang-color.js';
import { UndoManager } from './undo-manager.js';
import { colRowFromTileId, tileIdFromColRow } from '../utils/tile-math.js';

export type TileFilter = 'all' | 'tagged' | 'untagged';

export interface WangRegionClipboard {
  width: number;
  height: number;
  sourceColorA: number;
  sourceColorB: number;
  entries: Map<string, number[]>;  // "relCol,relRow" → wangid
}

export type EditorEvent =
  | 'selectedTileChanged'
  | 'activeWangSetChanged'
  | 'activeColorChanged'
  | 'metadataChanged'
  | 'zoomChanged'
  | 'templateModeChanged'
  | 'templateSlotChanged'
  | 'activeTilesetChanged'
  | 'clipboardChanged';

type Listener = () => void;

/**
 * Centralized editor state with pub/sub for panel coordination.
 */
export class EditorState {
  private _selectedTileId: number = -1;
  private _selectedTileIds: Set<number> = new Set();
  private _tileFilter: TileFilter = 'all';
  private _activeWangSetIndex: number = 0;
  private _activeColorId: number = 1;
  private _metadata: ProjectMetadata;
  private _activeTilesetIndex: number = 0;
  private _zoom: number = 2;
  private _templateMode = false;
  private _activeTemplateSlot = -1;
  private _templateColorA: number = 1;
  private _templateColorB: number = 2;
  private _wangClipboard: WangRegionClipboard | null = null;
  private listeners = new Map<EditorEvent, Set<Listener>>();
  private undoManager = new UndoManager();

  constructor(metadata: ProjectMetadata) {
    this._metadata = metadata;
  }

  // --- Getters ---

  get selectedTileId(): number {
    return this._selectedTileId;
  }

  get selectedTileIds(): ReadonlySet<number> {
    return this._selectedTileIds;
  }

  get tileFilter(): TileFilter {
    return this._tileFilter;
  }

  get activeWangSetIndex(): number {
    return this._activeWangSetIndex;
  }

  get activeColorId(): number {
    return this._activeColorId;
  }

  get metadata(): ProjectMetadata {
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

  /** Get the current transformation config, with defaults */
  get transformations(): TransformationConfig {
    return this._metadata.transformations ?? DEFAULT_TRANSFORMATIONS;
  }

  /** Active tileset index */
  get activeTilesetIndex(): number {
    return this._activeTilesetIndex;
  }

  /** Active tileset definition */
  get activeTileset(): TilesetDef {
    return this._metadata.tilesets[this._activeTilesetIndex];
  }

  get wangClipboard(): WangRegionClipboard | null {
    return this._wangClipboard;
  }

  /** Convenience getters scoped to active tileset */
  get columns(): number { return this.activeTileset.columns; }
  get tileCount(): number { return this.activeTileset.tileCount; }
  get tileWidth(): number { return this.activeTileset.tileWidth; }
  get tileHeight(): number { return this.activeTileset.tileHeight; }

  // --- Setters (emit events) ---

  setActiveTileset(index: number): void {
    if (this._activeTilesetIndex === index) return;
    if (index < 0 || index >= this._metadata.tilesets.length) return;
    this._activeTilesetIndex = index;
    // Clear selection when switching tilesets
    this._selectedTileId = -1;
    this._selectedTileIds.clear();
    this.emit('activeTilesetChanged');
    this.emit('selectedTileChanged');
  }

  selectTile(tileId: number): void {
    this._selectedTileIds.clear();
    if (tileId >= 0) this._selectedTileIds.add(tileId);
    if (this._selectedTileId === tileId) return;
    this._selectedTileId = tileId;
    this.emit('selectedTileChanged');
  }

  /** Add a range of tiles to selection (for shift-click) */
  selectTileRange(fromId: number, toId: number): void {
    const columns = this.columns;
    const [fromCol, fromRow] = colRowFromTileId(fromId, columns);
    const [toCol, toRow] = colRowFromTileId(toId, columns);

    const minCol = Math.min(fromCol, toCol);
    const maxCol = Math.max(fromCol, toCol);
    const minRow = Math.min(fromRow, toRow);
    const maxRow = Math.max(fromRow, toRow);

    this._selectedTileIds.clear();
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const id = tileIdFromColRow(c, r, columns);
        if (id < this.tileCount) {
          this._selectedTileIds.add(id);
        }
      }
    }
    this._selectedTileId = toId;
    this.emit('selectedTileChanged');
  }

  /** Toggle a tile in/out of the current selection (for Cmd/Ctrl-click) */
  toggleTileSelection(tileId: number): void {
    if (this._selectedTileIds.has(tileId)) {
      this._selectedTileIds.delete(tileId);
      if (this._selectedTileId === tileId) {
        // Pick another selected tile as primary, or -1 if none left
        const next = this._selectedTileIds.values().next();
        this._selectedTileId = next.done ? -1 : next.value;
      }
    } else {
      this._selectedTileIds.add(tileId);
      this._selectedTileId = tileId;
    }
    this.emit('selectedTileChanged');
  }

  /** Set the tile filter mode */
  setTileFilter(filter: TileFilter): void {
    if (this._tileFilter === filter) return;
    this._tileFilter = filter;
    this.emit('selectedTileChanged'); // Reuse event to trigger re-render
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
    const clamped = Math.max(1, Math.min(8, zoom));
    if (clamped === this._zoom) return;
    this._zoom = clamped;
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

  /** Update transformation config */
  setTransformations(config: Partial<TransformationConfig>): void {
    this.saveSnapshot();
    if (!this._metadata.transformations) {
      this._metadata.transformations = { ...DEFAULT_TRANSFORMATIONS };
    }
    Object.assign(this._metadata.transformations, config);
    this.emit('metadataChanged');
  }

  // --- Clipboard (copy/paste WangId regions) ---

  copyWangRegion(): void {
    const selectedIds = this._selectedTileIds;
    if (selectedIds.size === 0) return;

    const columns = this.columns;
    let minCol = Infinity, maxCol = -1, minRow = Infinity, maxRow = -1;
    for (const id of selectedIds) {
      const [c, r] = colRowFromTileId(id, columns);
      minCol = Math.min(minCol, c);
      maxCol = Math.max(maxCol, c);
      minRow = Math.min(minRow, r);
      maxRow = Math.max(maxRow, r);
    }

    const entries = new Map<string, number[]>();
    for (const id of selectedIds) {
      const wt = this.getWangTile(id);
      if (!wt) continue;
      const [c, r] = colRowFromTileId(id, columns);
      entries.set(`${c - minCol},${r - minRow}`, [...wt.wangid]);
    }

    // Detect Color A from the TL corner (wangid index 7) of the top-left tile
    const topLeftWangid = entries.get('0,0');
    const sourceColorA = topLeftWangid?.[7] ?? 0;

    // Color B is the first other non-zero color found across all entries
    let sourceColorB = 0;
    for (const wangid of entries.values()) {
      for (const v of wangid) {
        if (v !== 0 && v !== sourceColorA) { sourceColorB = v; break; }
      }
      if (sourceColorB !== 0) break;
    }

    this._wangClipboard = {
      width: maxCol - minCol + 1,
      height: maxRow - minRow + 1,
      sourceColorA,
      sourceColorB,
      entries,
    };
    this.emit('clipboardChanged');
  }

  pasteWangRegion(newColorA: number, newColorB: number): boolean {
    if (!this._wangClipboard) return false;

    const selectedIds = this._selectedTileIds;
    if (selectedIds.size === 0) return false;

    const columns = this.columns;
    let minCol = Infinity, maxCol = -1, minRow = Infinity, maxRow = -1;
    for (const id of selectedIds) {
      const [c, r] = colRowFromTileId(id, columns);
      minCol = Math.min(minCol, c);
      maxCol = Math.max(maxCol, c);
      minRow = Math.min(minRow, r);
      maxRow = Math.max(maxRow, r);
    }
    const regionW = maxCol - minCol + 1;
    const regionH = maxRow - minRow + 1;

    if (regionW !== this._wangClipboard.width || regionH !== this._wangClipboard.height) {
      return false;
    }

    const { sourceColorA, sourceColorB, entries } = this._wangClipboard;
    const remapped: Array<{ tileId: number; wangid: number[] }> = [];

    for (const [key, wangid] of entries) {
      const [rc, rr] = key.split(',').map(Number);
      const tileId = tileIdFromColRow(minCol + rc, minRow + rr, columns);

      const newWangid = wangid.map(v => {
        if (v === sourceColorA) return newColorA;
        if (v === sourceColorB) return newColorB;
        return v;
      });
      remapped.push({ tileId, wangid: newWangid });
    }

    if (remapped.length > 0) {
      this.setWangIdMulti(remapped);
    }
    return true;
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

  /** Get the WangTile data for a tile ID in the active WangSet (filtered by active tileset) */
  getWangTile(tileId: number): WangTileData | undefined {
    const ws = this.activeWangSet;
    if (!ws) return undefined;
    return ws.wangtiles.find(wt => wt.tileid === tileId && (wt.tileset ?? 0) === this._activeTilesetIndex);
  }

  /** Set or update the WangId for a tile in the active WangSet */
  setWangId(tileId: number, wangid: number[]): void {
    const ws = this.activeWangSet;
    if (!ws) return;
    this.saveSnapshot();

    const existing = ws.wangtiles.find(wt => wt.tileid === tileId && (wt.tileset ?? 0) === this._activeTilesetIndex);
    if (existing) {
      existing.wangid = [...wangid];
    } else {
      ws.wangtiles.push({ tileid: tileId, wangid: [...wangid], tileset: this._activeTilesetIndex });
    }
    this.emit('metadataChanged');
  }

  /** Remove a tile's WangId mapping from the active WangSet */
  removeWangTile(tileId: number): void {
    const ws = this.activeWangSet;
    if (!ws) return;

    const idx = ws.wangtiles.findIndex(wt => wt.tileid === tileId && (wt.tileset ?? 0) === this._activeTilesetIndex);
    if (idx >= 0) {
      this.saveSnapshot();
      ws.wangtiles.splice(idx, 1);
      this.emit('metadataChanged');
    }
  }

  /** Set probability for a tile in the active WangSet. No-op if tile not tagged. */
  setTileProbability(tileId: number, probability: number): void {
    const ws = this.activeWangSet;
    if (!ws) return;
    const wt = ws.wangtiles.find(w => w.tileid === tileId && (w.tileset ?? 0) === this._activeTilesetIndex);
    if (!wt) return;
    this.saveSnapshot();
    wt.probability = probability;
    this.emit('metadataChanged');
  }

  /** Set WangIds for multiple tiles in a single undo snapshot */
  setWangIdMulti(entries: Array<{ tileId: number; wangid: number[] }>): void {
    const ws = this.activeWangSet;
    if (!ws || entries.length === 0) return;
    this.saveSnapshot();
    for (const { tileId, wangid } of entries) {
      const existing = ws.wangtiles.find(wt => wt.tileid === tileId && (wt.tileset ?? 0) === this._activeTilesetIndex);
      if (existing) {
        existing.wangid = [...wangid];
      } else {
        ws.wangtiles.push({ tileid: tileId, wangid: [...wangid], tileset: this._activeTilesetIndex });
      }
    }
    this.emit('metadataChanged');
  }

  /** Set probability for multiple tiles in a single undo snapshot */
  setTileProbabilityMulti(tileIds: number[], probability: number): void {
    const ws = this.activeWangSet;
    if (!ws || tileIds.length === 0) return;
    const targets = tileIds
      .map(id => ws.wangtiles.find(wt => wt.tileid === id && (wt.tileset ?? 0) === this._activeTilesetIndex))
      .filter((wt): wt is WangTileData => wt !== undefined);
    if (targets.length === 0) return;
    this.saveSnapshot();
    for (const wt of targets) {
      wt.probability = probability;
    }
    this.emit('metadataChanged');
  }

  /** Remove wangtile entries for multiple tiles in a single undo snapshot */
  removeWangTileMulti(tileIds: number[]): void {
    const ws = this.activeWangSet;
    if (!ws || tileIds.length === 0) return;
    const indices = tileIds
      .map(id => ws.wangtiles.findIndex(wt => wt.tileid === id && (wt.tileset ?? 0) === this._activeTilesetIndex))
      .filter(idx => idx >= 0)
      .sort((a, b) => b - a);
    if (indices.length === 0) return;
    this.saveSnapshot();
    for (const idx of indices) {
      ws.wangtiles.splice(idx, 1);
    }
    this.emit('metadataChanged');
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

  /** Add a new color to the active WangSet (color auto-assigned from palette) */
  addColor(name: string): void {
    const ws = this.activeWangSet;
    if (!ws) return;
    this.saveSnapshot();
    const colorId = ws.colors.length + 1;
    ws.colors.push({ name, color: wangColorHex(colorId), probability: 1.0, tile: -1 });
    this.emit('metadataChanged');
  }

  /** Update properties of a color in the active WangSet */
  updateColor(colorIndex: number, updates: Partial<{ name: string; probability: number; tile: number; tileset: number | undefined }>): void {
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

  // --- Animation CRUD ---

  /** Get all animations */
  get animations(): AnimationData[] {
    return this._metadata.animations ?? [];
  }

  /** Add a new animation */
  addAnimation(name: string, frameCount: number, frameDuration: number, pattern: 'loop' | 'ping-pong'): void {
    this.saveSnapshot();
    if (!this._metadata.animations) {
      this._metadata.animations = [];
    }
    const frames: AnimationFrameData[] = [];
    for (let i = 0; i < frameCount; i++) {
      frames.push({ tileIdOffset: 0, description: `Frame ${i + 1}` });
    }
    this._metadata.animations.push({ name, frameCount, frameDuration, pattern, frames });
    this.emit('metadataChanged');
  }

  /** Remove an animation by index */
  removeAnimation(index: number): void {
    if (!this._metadata.animations) return;
    if (index < 0 || index >= this._metadata.animations.length) return;
    this.saveSnapshot();
    this._metadata.animations.splice(index, 1);
    this.emit('metadataChanged');
  }

  /** Update an animation's frame offset */
  setAnimationFrameOffset(animIndex: number, frameIndex: number, offset: number): void {
    const anims = this._metadata.animations;
    if (!anims || !anims[animIndex] || !anims[animIndex].frames[frameIndex]) return;
    this.saveSnapshot();
    anims[animIndex].frames[frameIndex].tileIdOffset = offset;
    this.emit('metadataChanged');
  }

  /** Update an animation's properties */
  updateAnimation(index: number, updates: Partial<{ name: string; frameDuration: number; pattern: 'loop' | 'ping-pong' }>): void {
    const anims = this._metadata.animations;
    if (!anims || !anims[index]) return;
    this.saveSnapshot();
    Object.assign(anims[index], updates);
    this.emit('metadataChanged');
  }

  /** Copy WangId assignments from frame 0 to all other frames of an animation */
  syncAnimationFrames(animIndex: number): void {
    const anims = this._metadata.animations;
    if (!anims || !anims[animIndex]) return;
    const anim = anims[animIndex];
    if (anim.frames.length < 2) return;

    const ws = this.activeWangSet;
    if (!ws) return;

    this.saveSnapshot();
    const baseOffset = anim.frames[0].tileIdOffset;

    // Find all wangtiles that could be base frame tiles
    // For each base tile, copy its WangId to offset tiles in other frames
    for (const wt of [...ws.wangtiles]) {
      for (let f = 1; f < anim.frames.length; f++) {
        const frameOffset = anim.frames[f].tileIdOffset - baseOffset;
        const targetTileId = wt.tileid + frameOffset;
        if (targetTileId < 0 || targetTileId >= this.tileCount) continue;

        const existing = ws.wangtiles.find(w => w.tileid === targetTileId && (w.tileset ?? 0) === (wt.tileset ?? 0));
        if (existing) {
          existing.wangid = [...wt.wangid];
          existing.probability = wt.probability;
        } else {
          ws.wangtiles.push({ tileid: targetTileId, wangid: [...wt.wangid], probability: wt.probability, tileset: wt.tileset });
        }
      }
    }

    this.emit('metadataChanged');
  }

  /** Replace the entire metadata (e.g., after loading from file) */
  setMetadata(metadata: ProjectMetadata): void {
    this._metadata = metadata;
    this._activeWangSetIndex = 0;
    this._activeTilesetIndex = 0;
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
