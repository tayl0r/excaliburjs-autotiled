# Implementation Status — Plans vs. Codebase

> Compares the original specification documents and implementation plans in `./docs/`
> against what is actually implemented in `src/`. Last updated: 2026-02-18.

---

## Autotile Engine Spec (`AUTOTILE_ENGINE_SPEC.md`)

### Phase 1: Data Model (Section 11 Checklist)

| Item | Status | Notes |
|------|--------|-------|
| `WangId` class with rotation, flipping, matching | Done | `src/core/wang-id.ts` — uses 8-element number array (not bit-packed int64) |
| `WangColor` struct | Done | `src/core/wang-color.ts` |
| `WangSet` class with tile-to-WangId mapping | Done | `src/core/wang-set.ts` |
| `Cell` struct with flip flags | Done | `src/core/cell.ts` |
| `RandomPicker` weighted random selection | Done | `src/core/random-picker.ts` |
| JSON load/save for metadata format | Done | `src/core/metadata-loader.ts`, `src/core/metadata-schema.ts` |

### Phase 2: Algorithm Core (Section 11 Checklist)

| Item | Status | Notes |
|------|--------|-------|
| `wangIdFromSurroundings()` — read neighbor constraints | Done | `src/core/matching.ts` |
| `findBestMatch()` — penalty-based candidate search | Done | `src/core/matching.ts` — includes tile probability weighting |
| `computeColorDistances()` — Floyd-Warshall transition matrix | Done | `src/core/color-distance.ts` — includes next-hop matrix |
| `generateAllVariants()` — rotated/flipped tile pre-computation | Done | `src/core/variant-generator.ts` — with deduplication |
| `apply()` / fill region with best matches | Done | `src/core/terrain-painter.ts` — `applyTerrainPaint()` |

### Phase 3: Runtime Integration (Section 11 Checklist)

| Item | Status | Notes |
|------|--------|-------|
| Load metadata on tileset init | Done | `src/engine/tileset-manager.ts` |
| Pre-compute variant cache and distance matrix | Done | Built during tileset load |
| Terrain paint brush (paint + update neighbors) | Done | `src/engine/autotile-tilemap.ts` — `paintTerrain()` |
| Terrain fill tool (flood fill with autotiling) | Done | `src/core/flood-fill.ts`, `autotile-tilemap.ts` — `fillTerrain()` |
| Render tiles with flip/rotation flags | Done | `src/engine/sprite-resolver.ts` |
| Handle animated tiles | Done | `src/engine/animation-controller.ts` — frame offset cycling |

### Indirect Transitions / Smart Paint Brush (Section 5.5)

| Item | Status | Notes |
|------|--------|-------|
| BFS intermediate color ring insertion | Done | `src/core/terrain-painter.ts` — `insertIntermediates()` |
| Next-hop color on shortest path | Done | `src/core/color-distance.ts` via Floyd-Warshall |
| Center-outward tile recomputation | Done | `src/core/terrain-painter.ts` — `recomputeTiles()` |

### Weighted Random Selection (Section 8)

| Item | Status | Notes |
|------|--------|-------|
| Per-tile probability weight | Done | Stored per wangtile, used in `findBestMatch()` |
| Per-color probability (WangColor.probability) | Done | Product of color probabilities in `wangIdProbability()` |

---

## Tile Metadata Editor Spec (`TILE_METADATA_EDITOR_SPEC.md`)

### Section 10 Implementation Checklist

| Item | Status | Notes |
|------|--------|-------|
| Project management (create/open, register tilesets) | Partial | ProjectMetadata format with multiple tilesets; no create/open UI |
| Tileset image loader (scrollable/zoomable viewer) | Done | `src/editor/panels/tileset-panel.ts` — Ctrl+wheel zoom |
| Tile selection and inspection | Done | `src/editor/panels/inspector-panel.ts` |
| Multi-select tiles (shift-click range, ctrl-click) | Done | Both range and toggle multi-select implemented |
| Filter/search (tagged vs untagged, by WangSet) | Partial | Tagged/untagged/all filter exists; no per-WangSet filter or text search |
| WangSet creation/management UI | Done | Create, rename (double-click), delete in WangSet panel |
| WangColor creation/management UI | Done | Create, edit name/color/probability/tile, delete with reference shifting |
| Method A: Click-to-paint per-index WangId assignment | Done | 8-zone clickable grid in inspector, respects corner/edge/mixed type |
| Method B: Template drag-and-drop (16-slot grid) | Done | `src/editor/panels/template-panel.ts` — click-to-assign + auto-fill |
| Method C: Region auto-detect with layout patterns | Done | `src/editor/panels/region-assign-panel.ts` + `layout-patterns.ts` |
| Color overlay rendering on tagged tiles | Done | `src/editor/overlay-manager.ts` — colored triangles/rectangles |
| Completeness validation | Done | `src/editor/completeness-checker.ts` — with expandable missing list in panel |
| Adjacency preview (3x3 grid) | Removed | Was in `src/editor/adjacency-preview.ts`; removed from inspector panel |
| Transformation configuration (flip H/V, rotation) | Done | Checkboxes in WangSet panel with impact multiplier display |
| Transformation preview (show all variants) | Not done | No UI to view generated variants for a selected tile |
| Animation frame support | Done | `src/editor/panels/animation-panel.ts` — frame sync, offset editing, auto-copy tags |
| Layout pattern definitions | Partial | 2 patterns defined (Standard 4x4 Binary, Fantasy 1x16); RPG Maker VX and custom pattern creation not implemented |
| Save/load metadata JSON files | Partial | Auto-save to server endpoint works (5s debounce); no manual save, load dialog, or standalone JSON export |
| Multi-tileset workflow (tabbed interface) | Partial | ProjectMetadata supports multiple tilesets; editor operates on active tileset; tab bar UI not yet implemented |
| Undo/redo for all tagging operations | Done | `src/editor/undo-manager.ts` — full snapshot-based undo stack |
| Keyboard shortcuts | Partial | See detail below |

### Keyboard Shortcuts Detail

| Shortcut | Spec | Status |
|----------|------|--------|
| `1-9` select WangColor | Yes | Done |
| `Delete` remove tile from WangSet | Yes | Not done |
| `Shift+Click` erase (set zone to 0) | Yes | Not done (Shift+Click is range select instead) |
| `Ctrl/Cmd+Click` multi-select | Yes | Done |
| `Space` toggle overlay | Yes | Not done |
| `+/-` zoom | Yes | Not done (Ctrl+wheel zoom only) |
| `Ctrl+S` save | Yes | Not done (auto-save only) |
| `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo | Yes | Done |
| `T` open template view | Yes | Done (toggles entire editor) |
| `P` toggle adjacency preview | Yes | N/A — adjacency preview removed |

---

## JSON Schema (`AUTOTILE_JSON_SCHEMA.md`)

| Item | Status | Notes |
|------|--------|-------|
| Per-tileset metadata file format | Done | `src/core/metadata-schema.ts` — TilesetDef + ProjectMetadata (version 2) |
| Top-level fields (image, dimensions, columns, tileCount) | Done | |
| Transformations object | Done | allowRotate, allowFlipH, allowFlipV, preferUntransformed |
| WangSet with name, type, colors, wangtiles | Done | |
| WangColor with name, color, probability, tile | Done | |
| WangTile with tileid and 8-element wangid | Done | |
| Animation sequences (name, frames, duration, pattern) | Done | |
| Validation rules (Section 5) | Partial | Type-constraint validation on load; no real-time duplicate-tileid warning in editor |
| Project file format (Section 3) | Done | `ProjectMetadata` with `version: 2`, `tilesets[]`, migration from legacy format |

---

## TimeFantasy Asset Guide (`TIMEFANTASY_ASSET_GUIDE.md`)

| Item | Status | Notes |
|------|--------|-------|
| Ground Terrain WangSet (Grass/Dirt/Sand/Rock) | Done | Configured in `terrain.autotile.json` with tile probabilities |
| Water WangSet (3-frame animated, ping-pong) | Not done | water.png loaded in project metadata but no tiles tagged yet |
| Forest Canopy WangSet | Not done | No `outside.png` tileset loaded |
| Cliff/Mountain handling | Not done | |
| Desert Terrain WangSet | Not done | No `desert.png` tileset loaded |
| Dungeon Floor WangSet | Not done | No `dungeon.png` tileset loaded |
| Castle Floor WangSet | Not done | No `castle.png` tileset loaded |

Only the ground terrain tileset has been authored. water.png is loaded in the project metadata but awaits tile tagging in the editor. The remaining asset authoring depends on the tileset tab bar UI.

---

## Implementation Plans (`docs/plans/`)

### 2026-02-16: Template Batch Tagging (`2026-02-16-template-batch-tagging.md`)

| Task | Status | Notes |
|------|--------|-------|
| Task 1: EditorState template mode state | Done | `templateMode`, `activeTemplateSlot`, events |
| Task 2: Template WangId generation utility | Done | `src/editor/template-utils.ts` with `TEMPLATE_SLOTS` and `templateSlotWangId()` |
| Task 3: TemplatePanel UI (4x4 grid, auto-fill) | Done | `src/editor/panels/template-panel.ts` |
| Task 4: Wire into tile editor (tab switching, click-to-assign) | Done | Template/Inspector tab switching, click assigns in template mode |
| Task 5: Final verification | Done | Tests pass |

### 2026-02-16: Editor CRUD & Validation (`2026-02-16-editor-crud-validation.md`)

| Task | Status | Notes |
|------|--------|-------|
| Task 1: WangSet CRUD (add, remove, rename) | Done | `EditorState.addWangSet()`, `removeWangSet()`, `renameWangSet()` |
| Task 2: WangColor CRUD (add, update, remove with ref shifting) | Done | `EditorState.addColor()`, `updateColor()`, `removeColor()` |
| Task 3: Completeness checker utility | Done | `src/editor/completeness-checker.ts` with tests |
| Task 4: WangSet CRUD UI (panel buttons) | Done | Create, double-click rename, delete in WangSet panel |
| Task 5: WangColor CRUD UI (swatch, name edit, delete) | Done | Full color row with swatch picker, inline rename, delete |
| Task 6: Completeness status display | Done | Status line + expandable missing combination list |
| Task 7: Full test suite verification | Done | All tests pass |

### 2026-02-17: WangColor UI Improvements (`2026-02-17-wangcolor-ui-improvements.md`)

| Task | Status | Notes |
|------|--------|-------|
| Task 1: Tests for updateColor probability/tile fields | Done | Tests confirm existing `Object.assign` behavior |
| Task 2: Pass spritesheet image to WangSetPanel | Done | Image available for tile thumbnail rendering |
| Task 3: Probability badge with inline editing | Done | `P:1` badge, click to edit, yellow highlight for non-default |
| Task 4: Representative tile thumbnail + picker | Done | Canvas thumbnail, "Set Rep Tile" button, right-click to clear |
| Task 5: Final verification | Done | All tests pass |

### 2026-02-17: Copy/Paste WangId Regions

| Task | Status | Notes |
|------|--------|-------|
| Task 1: EditorState clipboard + copy/paste methods | Done | `WangRegionClipboard` interface, `copyWangRegion()`, `pasteWangRegion()` with color remapping |
| Task 2: Tests for copy/paste | Done | 7 tests covering dimensions, events, remap, mismatch, empty clipboard, undo, skip untagged |
| Task 3: Region Assign Panel — Copy/Paste buttons | Done | Copy/Paste row, clipboard dimension label, Color A/B synced to `state.templateColorA/B` |
| Task 4: Update CHANGELOG | Done | This section |

### 2026-02-17: Multi-Tileset Support (`multi-tileset-plan.md`)

| Task | Status | Notes |
|------|--------|-------|
| Task 1: Schema — ProjectMetadata, TilesetDef | Done | `TilesetDef`, `ProjectMetadata` interfaces, `tileset` field on `WangTileData` |
| Task 2: Migration — Legacy to ProjectMetadata | Done | `src/core/metadata-migration.ts` with idempotent migration |
| Task 3: Cell — Add tilesetIndex | Done | `Cell.tilesetIndex`, updated `createCell()`, `cellSpriteKey()` |
| Task 4: WangSet — Composite tile keys | Done | `Map<string, WangId>` with `"tilesetIndex:tileId"` keys |
| Task 5: Variant Generator — Carry tilesetIndex | Done | tilesetIndex preserved through rotation/flip transforms |
| Task 6: Matching — Use qualified lookups | Done | `wangIdOf(tilesetIndex, tileId)` throughout |
| Task 7: Metadata Loader — Accept ProjectMetadata | Done | Accepts both formats, passes `wt.tileset ?? 0` |
| Task 8: Fix all tests | Done | All 174 tests updated and passing |
| Task 9: EditorState — Switch to ProjectMetadata | Done | Active tileset concept, convenience getters, scoped operations |
| Task 10: TileEditor — Accept ProjectMetadata | Done | Saves as `project.autotile.json` |
| Task 11: TilesetPanel — Tileset tab bar | Done | Tab bar above filter row, switches active tileset image and grid dimensions |
| Task 12: Other Panels — Use state getters | Done | All panels use `state.columns/tileWidth/tileHeight/tileCount` |
| Task 13: SpriteResolver — Multi-spritesheet | Done | `TilesetSheet[]` array, resolves via `cell.tilesetIndex` |
| Task 14: TilesetManager — ProjectMetadata | Done | Uses `primaryTileset` getter for tileset[0] dimensions |
| Task 15: main.ts — Load project + migrate | Done | Loads `project.autotile.json` with fallback to legacy |
| Task 16: Create project.autotile.json | Done | Terrain + water.png tilesets, water has no wangtiles |
| Task 17: Update CHANGELOG | Done | This section |

### 2026-02-17: Per-Tile Animation Redesign

| Task | Status | Notes |
|------|--------|-------|
| Task 1: Data Model — TileAnimation on WangTileData | Done | `TileAnimation` interface with `frameDuration`, `pattern`, `frames[]`; added `animation?` to `WangTileData`; removed `AnimationData` and project-level `animations[]` from schema |
| Task 2: EditorState — Per-Tile Animation Methods | Done | Removed standalone animation state/methods (`activeAnimationIndex`, pick mode, CRUD); added `setTileAnimation`, `setTileAnimationMulti`, `copyTileAnimation`, `pasteTileAnimation`, `applyAnimationToColorTiles` with clipboard + offset |
| Task 3: Inspector Panel — Inline Animation Editor | Done | "Is animated?" checkbox, duration/frames/pattern controls, frame slot thumbnails, "Populate from offset" button, Copy/Paste/Apply to color buttons, live preview canvas |
| Task 4: Remove AnimationPanel + Cleanup | Done | Deleted `animation-panel.ts`; removed from `tile-editor.ts`; replaced animation highlights with "A" badge on animated tiles in tileset panel |
| Task 5: Runtime — AnimationController from WangTiles | Done | `addTileAnimation(tileId, tilesetIndex, animation)` keyed by `"tileset:tileId"`; `setAnimationsFromWangSets()` iterates wangtiles; removed `AnimationData` import |
| Task 6: Migration | Removed | Migration code removed — old animation formats no longer supported |
| Task 7: Update CHANGELOG + Verify | Done | `tsc --noEmit` clean; 186 tests pass |
| Post: Legacy cleanup | Done | Removed `TilesetMetadata`, `metadata-migration.ts`, `terrain.autotile.json`, legacy `validateMetadata`; all code now uses `ProjectMetadata` exclusively |
| Post: Region Assign above Animation | Done | RegionAssignPanel mounted inside InspectorPanel above animation section |
| Post: Multi-select animation uncheck | Done | Unchecking "Is animated?" with multiple tiles removes animation from all selected |

---

## 2026-02-18: Codebase Simplification & Refinement

Systematic code review and cleanup across all source and test files. No behavioral changes.

| Area | Change | Files |
|------|--------|-------|
| DOM cleanup | Replaced `while (firstChild) removeChild` and custom `clearChildren()` with native `replaceChildren()` | `overlay-manager.ts`, `inspector-panel.ts`, `region-assign-panel.ts`, `wangset-panel.ts`, `template-panel.ts` |
| Type imports | Changed value imports of type-only symbols to `import type` | `editor-state.ts`, `autotile-tilemap.ts`, `animation-controller.ts`, `completeness-checker.ts`, `inspector-panel.ts`, 4 test files |
| Deduplication | Extracted shared `buildWangSets()` from duplicated init logic | `tileset-manager.ts` |
| Deduplication | Extracted shared test helpers (`makeColor`, `createGrassDirtWangSet`, `createThreeColorWangSet`) | New `tests/core/test-helpers.ts`; updated `color-distance.test.ts`, `variant-generator.test.ts`, `matching.test.ts`, `flood-fill.test.ts` |
| Inline types | Replaced `import()` type references with proper top-level imports | `game-scene.ts` |
| Simplification | Replaced for-loop with `Array.map` in `loadMetadata` | `metadata-loader.ts` |
| Simplification | Replaced verbose boundary loop with `filter`+`some` | `flood-fill.ts` |
| Simplification | Replaced manual string parsing with `split(':').map(Number)` | `wang-set.ts` |
| Simplification | Removed unused variables, redundant comments, redundant local variables | `game-scene.ts`, `inspector-panel.ts`, `main.ts`, `template-panel.ts` |

Verification: `tsc --noEmit` clean, 186 tests passing.

---

## 2026-02-18: Multi-Page App Split

Split the single-page app into separate pages for the tileset editor and map painter.

| Task | Status | Notes |
|------|--------|-------|
| Landing page at `/` | Done | `index.html` — links to both tools |
| Tileset editor at `/tools/tileset-editor/` | Done | `tools/tileset-editor/index.html` + `src/tileset-editor-main.ts` — standalone full-page editor, always visible |
| Map painter at `/tools/map-painter/` | Done | `tools/map-painter/index.html` + `src/map-painter-main.ts` — Excalibur canvas with Brush/Fill tools only |
| OverlayManager standalone mode | Done | Removed toggle/hide/show, always `display: block`, fills viewport naturally instead of absolute overlay |
| TileEditor standalone mode | Done | Removed `onHide`, `toggle`, `show`, `hide`, `isActive`; renders immediately in constructor |
| GameScene cleanup | Done | Removed `reloadMetadata()`, removed "Tile Data" toolbar button |
| InputHandler cleanup | Done | Removed `tiledata` from `ToolMode`, removed `inspectAt` and `setOnTileInspect` |
| Vite multi-page config | Done | `build.rollupOptions.input` with 3 HTML entry points, `build.target: 'esnext'` for top-level await |
| Delete `src/main.ts` | Done | Replaced by `src/tileset-editor-main.ts` and `src/map-painter-main.ts` |
| Verification | Done | `tsc --noEmit` clean, `vite build` clean, 186 tests passing |

---

## 2026-02-18: Codebase Simplification & Refinement (Round 2)

Continued systematic code review covering all remaining source files. No behavioral changes.

| Area | Change | Files |
|------|--------|-------|
| Type imports | Changed `import { ProjectMetadata }` to `import type` | `tile-editor.ts` |
| Deduplication | Extracted `startInlineEdit()` helper consolidating 3 identical commit/escape/blur inline-edit patterns | `wangset-panel.ts` |
| Deduplication | Extracted `createTextInput()` for shared text input styling | `wangset-panel.ts` |
| Deduplication | Extracted `startInlineEdit()` for inline probability editing | `inspector-panel.ts` |
| Deduplication | Added `computeTileBounds()` utility to replace 3 identical min/max col/row loops | `tile-math.ts`, `editor-state.ts`, `region-assign-panel.ts` |
| Engine cleanup | Extracted `TOOLS` constant, simplified keyboard handler with `find()` | `game-scene.ts` |
| Engine cleanup | Removed redundant `metadataJson` field, `buildWangSets()` uses `this.metadata` directly | `tileset-manager.ts` |
| Rendering cleanup | Computed `tw`/`th` once, passed to helpers instead of redundant recalculation | `tileset-panel.ts` |
| State cleanup | Extracted `restoreSnapshot()` to deduplicate undo/redo logic | `editor-state.ts` |
| Batch operations | Changed `clearAll()` to use `removeWangTileMulti()` | `template-panel.ts` |
| Engine helpers | Extracted `forEachCell()` and `refreshAllTiles()` to deduplicate 3 nested loops | `autotile-tilemap.ts` |

Verification: `tsc --noEmit` clean, 186 tests passing.

---

## 2026-02-18: Skip Tile Replacement When Already Matching

Optimization to prevent unnecessary tile churn during autotiling. When recomputing tiles (brush paint or flood fill), existing tiles whose WangId already satisfies the desired configuration are now preserved instead of being randomly re-resolved.

| Change | Files |
|--------|-------|
| Reverse cell→WangId lookup (`cellWangIds` map + `wangIdOfCell()` method) | `src/core/wang-set.ts` |
| Skip replacement when existing tile matches desired WangId | `src/core/terrain-painter.ts` |
| Test: repainting same color preserves existing tiles | `tests/core/matching.test.ts` |
| Updated comment for same-color fill behavior | `tests/core/flood-fill.test.ts` |

Verification: `tsc --noEmit` clean, 187 tests passing.

---

## 2026-02-18: Map Persistence — Save/Load with Color-Only Data Model

Save and load painted maps. Only terrain colors are persisted; tile IDs are recomputed on load so saved maps automatically pick up tileset changes.

| Task | Status | Notes |
|------|--------|-------|
| Task 1: Map file schema | Done | `src/core/map-schema.ts` — `SavedMap` interface (version 1, wangSetName + flat colors) |
| Task 2: SimpleAutotileMap serialization | Done | `getColors()`, `importColors()` on `SimpleAutotileMap` |
| Task 3: Full tile rebuild | Done | `resolveAllTiles()` in `src/core/terrain-painter.ts` |
| Task 4: AutotileTilemap save/load | Done | `toSavedMap()`, `loadSavedMap()` in `src/engine/autotile-tilemap.ts` |
| Task 5: Vite API endpoints | Done | `mapSavePlugin()` in `vite.config.ts` — `POST /api/save-map`, `GET /api/list-maps` |
| Task 6: URL-based map routing | Done | `#map=<name>` hash in `src/map-painter-main.ts` — auto-loads on page refresh |
| Task 7: GameScene UI | Done | Save/Open toolbar buttons, `Ctrl+S`/`Ctrl+O` keyboard shortcuts |
| Task 8: Persistence tests | Done | `tests/core/map-persistence.test.ts` — 7 tests (serialization, resolve, round-trip) |

Saved maps stored at `assets/maps/<name>.json`.

Verification: `tsc --noEmit` clean, 194 tests passing.

---

## 2026-02-18: Editor Simplification & Refinement (Round 3)

Focused code review of `src/editor/` and `src/editor/panels/`. No behavioral changes.

| Area | Change | Files |
|------|--------|-------|
| Deduplication | Extracted `startInlineEdit()` into shared `inline-edit.ts` module, removing identical implementations from `WangSetPanel` and `InspectorPanel` | New `src/editor/inline-edit.ts`; `wangset-panel.ts`, `inspector-panel.ts` |
| State cleanup | Added `isActiveTileset()` helper to `EditorState`, eliminating 3 repeated `(wt.tileset ?? 0) === this._activeTilesetIndex` expressions | `editor-state.ts` |
| State cleanup | Simplified `removeWangTile()` to reuse `findWangTile()` instead of duplicating search logic | `editor-state.ts` |
| State cleanup | Simplified `removeWangTileMulti()` to use `filter()` with `Set` lookup instead of index-based splice loop | `editor-state.ts` |
| State cleanup | Simplified `removeColor()` active color clamping (redundant ternary) | `editor-state.ts` |
| Rendering cleanup | Extracted `activeWangTiles()` helper in `TilesetPanel`, replacing 4 repeated tileset-filter loops | `tileset-panel.ts` |
| Rendering cleanup | Simplified 4 triangle-drawing branches in `drawWangOverlays()` to single parametric draw using `dx`/`dy` | `tileset-panel.ts` |
| Inspector cleanup | Extracted `isZoneActive()` function to deduplicate WangSet type zone check in `drawGrid()` and `paintAllZones()` | `inspector-panel.ts` |
| Inspector cleanup | Extracted `applyToSelection()` helper to deduplicate single/multi-select dispatch in `paintZone()` and `paintAllZones()` | `inspector-panel.ts` |
| Overlay cleanup | Stored spacer element as field instead of fragile style-based querySelector lookup | `overlay-manager.ts` |
| Keyboard shortcuts | Simplified undo/redo handler by extracting shared meta-key check | `tile-editor.ts` |
| Missing list display | Simplified corner label formatting with `map`/`join` | `wangset-panel.ts` |

Verification: `tsc --noEmit` clean, 194 tests passing.

---

## 2026-02-18: Prefab Editor Tool

New third tool — a prefab editor at `/tools/prefab-editor/` for composing reusable tile arrangements ("prefabs") by selecting tiles from tilesets and stamping them onto a grid canvas.

| Task | Status | Notes |
|------|--------|-------|
| Prefab schema (`PrefabTile`, `SavedPrefab`) | Done | `src/core/prefab-schema.ts` |
| Prefab editor state with pub/sub | Done | `src/prefab/prefab-state.ts` — 7 event types, CRUD, tile placement, tool/zoom management |
| Vite API endpoints | Done | `prefabSavePlugin()` in `vite.config.ts` — `POST /api/save-prefab`, `GET /api/list-prefabs`, `DELETE /api/delete-prefab` |
| HTML page + entry point | Done | `tools/prefab-editor/index.html`, `src/prefab-editor-main.ts` |
| Landing page link | Done | Added "Prefab Editor" to `index.html` |
| Prefab editor controller + layout | Done | `src/prefab/prefab-editor.ts` — 3-zone grid layout, toolbar, autosave (5s debounce), keyboard shortcuts |
| Tileset viewer panel | Done | `src/prefab/tileset-viewer.ts` — spritesheet rendering, click/shift/ctrl selection, zoom, tooltip |
| Prefab list panel | Done | `src/prefab/prefab-list-panel.ts` — CRUD with inline rename, delete with server sync, tile count badge |
| Prefab canvas panel | Done | `src/prefab/prefab-canvas.ts` — grid rendering, tile stamp preview, placed tile drawing, anchor highlight, paint/erase/anchor tools |
| Move tool | Done | `src/prefab/prefab-canvas.ts` — select-rectangle + drag-to-move with ghost preview, single undo step |
| Copy tool | Done | `src/prefab/prefab-canvas.ts` — select-rectangle copies tiles as stamp, switches to paint mode for stamping |
| Keyboard shortcuts | Done | `E` toggles eraser, `M` toggles move, `C` toggles copy |
| Autosave wiring | Done | `prefabDataChanged` → 5s debounce → `POST /api/save-prefab` |
| Startup loading | Done | Fetches prefab list + all prefab JSONs on page load |
| Vite build config | Done | Added `prefab-editor` to rollup input |

Prefabs saved as individual JSON files in `assets/prefabs/<name>.json`.

Verification: `tsc --noEmit` clean, 194 tests passing.

---

## Summary

### Fully Complete

- Core autotile engine (WangId, matching, color distance, variants, random picker)
- Smart paint brush with indirect transitions (BFS intermediate insertion)
- Tile probability (per-tile and per-color weighting)
- Runtime integration (paint, fill, sprite resolution, animation)
- Editor state management with pub/sub events
- Undo/redo system
- Tileset viewer with zoom and multi-select
- Inspector panel with 8-zone WangId editor + inline per-tile animation editor
- Template panel with 4x4 grid and auto-fill
- WangSet and WangColor CRUD (state + UI)
- Completeness validation with status display
- ~~Adjacency preview (3x3 grid) — removed~~
- Color overlay rendering
- Transformation configuration UI
- Per-tile animation system (inline inspector editor, copy/paste with offset, apply to color, animated tile badges)
- Region auto-detect (2 layout patterns) with copy/paste WangId regions
- All implementation plans (2026-02-16 x2, 2026-02-17 x4)
- Ground terrain asset authoring (terrain.autotile.json → project.autotile.json)
- Multi-tileset data model (ProjectMetadata, TilesetDef, Cell.tilesetIndex, composite WangSet keys)
- Legacy code removed — all code uses ProjectMetadata v2 exclusively (no migration needed)
- Prefab editor tool — compose reusable tile arrangements with paint/erase/anchor/move/copy tools, autosave, multi-tileset support
- Multi-layer system — maps (9 layers, 5 editable) and prefabs (5 layers) with visibility modes (all/highlight/solo), v1→v2 schema migration

### Partially Complete

- **Keyboard shortcuts** — core set implemented, several from spec missing (Delete, Space, P, +/-)
- **Tile filter** — tagged/untagged/all works, no per-WangSet filter
- **Layout patterns** — 2 of 3+ planned patterns defined (missing RPG Maker VX, custom creation)
- **Save/load** — editor auto-save works; map painter has autosave (5s debounce) + manual save/load with color-only persistence; no standalone JSON export UI
- **Validation** — completeness checking works, no real-time duplicate WangId warning
- **Multi-tileset editor** — data model, editor state, and tileset tab bar all working; wangtile tagging scoped to active tileset
- **Multi-spritesheet runtime** — SpriteResolver and TilesetManager support multiple spritesheets; all tileset images loaded at startup

### Not Started

- **Transformation preview** — no UI to view generated variants
- **Asset authoring** for Water, Forest, Cliff, Desert, Dungeon, Castle tilesets

---

## 2026-02-19: Layer System for Maps and Prefabs

Added multi-layer support to both the map painter and prefab editor.

| Task | Status | Notes |
|------|--------|-------|
| Shared layer constants | Done | `src/core/layers.ts` — `NUM_PREFAB_LAYERS=5`, `NUM_MAP_LAYERS=9`, `NUM_EDITABLE_LAYERS=5`, `LayerVisibility` type |
| Map schema v2 with layers | Done | `src/core/map-schema.ts` — `SavedMapV1`, `SavedMap` (v2 with `layers: number[][]`), `migrateMapV1toV2()`, `parseSavedMap()` |
| Prefab schema v2 with layers | Done | `src/core/prefab-schema.ts` — `SavedPrefabV1`, `SavedPrefab` (v2 with `layers: PrefabTile[][]`), `migratePrefabV1toV2()`, `parseSavedPrefab()` |
| AutotileTilemap opacity + loadColors | Done | `setOpacity()`, `loadColors()`, opacity-aware `renderCell()` |
| InputHandler setTilemap | Done | One-line setter for layer switching |
| GameScene multi-layer | Done | 9 `AutotileTilemap` instances, layer bar UI (5 editable), visibility modes (all/highlight/solo), save/load v2, keyboard shortcuts 1-5 |
| Map painter hash parsing | Done | Switched to `URLSearchParams`, added `layer` param |
| Prefab state layer-aware | Done | `activeLayer`, `visibilityMode`, all tile ops on `prefab.layers[activeLayer]`, `prefabExtent` and `fitCanvasToPrefab` check all layers |
| Prefab canvas layer rendering | Done | Draws all 5 layers with visibility modes, selection/move/copy operate on active layer |
| Prefab editor layer bar | Done | Grid layout with layer bar row spanning all columns, 5 numbered buttons + visibility cycle button, 1-5 and V keyboard shortcuts |
| Prefab list tile count | Done | Badge sums tiles across all layers |
| Prefab editor main | Done | `parseSavedPrefab()` for v1 migration on load, `layer` in hash params |
| Migration tests | Done | `tests/core/layer-migration.test.ts` — 10 tests for map and prefab v1→v2 migration |

### Architecture

- **Maps**: 9 layers total. Layers 1-5 are user-editable (shown in UI). Layers 6-9 are overflow for prefab placement when a 5-layer prefab is placed on map layer 5.
- **Prefabs**: 5 layers, all editable.
- **Visibility modes**: All (full opacity), Highlight (active layer full, others 25%), Solo/Hidden (only active layer visible).
- **V1 migration**: Both map and prefab schemas auto-migrate from v1 on load. Map v1 `colors` becomes layer 0; prefab v1 `tiles` becomes layer 0.

Verification: `tsc --noEmit` clean, 204 tests passing.

---

## 2026-02-19: Map Painter UI Overhaul + Prefab Placement

Consolidated three separate UI zones (top toolbar, layer bar, bottom HUD) into a collapsible left sidebar. Added prefab placement capability to the map painter.

| Task | Status | Notes |
|------|--------|-------|
| Map schema — PlacedPrefab | Done | `src/core/map-schema.ts` — `PlacedPrefab` interface, `placedPrefabs?` on `SavedMap`, defaults to `[]` in `parseSavedMap()` |
| AutotileTilemap — placeCell/clearCell | Done | `src/engine/autotile-tilemap.ts` — public `placeCell()`, `clearCell()`, `renderCell()` made public |
| InputHandler — prefab tool mode | Done | `src/engine/input-handler.ts` — `'prefab'` tool mode, cursor position tracking, `onCursorMove`/`onPrefabPlace` callbacks |
| GameScene — sidebar UI | Done | `src/engine/game-scene.ts` — removed toolbar/HUD/layer bar, replaced with 240px left sidebar (dark theme, collapsible sections for File, Tools, Layers, Colors, Prefabs) |
| GameScene — prefab preview | Done | 5 preview tilemaps at z=100..104 with 0.4 opacity, efficient cell tracking for preview clear |
| GameScene — prefab placement | Done | Multi-layer placement with undo/redo stacks, Ctrl+Z to undo, Ctrl+Shift+Z to redo |
| GameScene — save/load prefabs | Done | `placedPrefabs` in saved map JSON, prefab expansion on load |
| map-painter-main — load prefabs | Done | `src/map-painter-main.ts` — fetches prefab list + JSON at startup, passes to `GameScene.setPrefabs()` |
| Tests | Done | 3 new tests in `tests/core/layer-migration.test.ts` — placedPrefabs default, preserve, v1 migration |
| Map painter autosave | Done | `src/engine/game-scene.ts` — 5s debounce after paint/fill/prefab changes, save indicator in sidebar header |
| Keyboard shortcuts | Done | Tab (toggle sidebar), Escape (cancel prefab), Ctrl+Z (undo), Ctrl+Shift+Z (redo), B/G/1-5/V/Ctrl+S/Ctrl+O preserved |

### UI Changes

- **Sidebar** (240px, left overlay): Header with collapse button, File (Save/Open), Tools (Brush/Fill), Layers (1-5 + visibility cycle), Colors (collapsible, thumbnails + names), Prefabs (collapsible, click to select)
- **Dark theme**: `#1e1e2e` background, `#333` borders, `#ccc` text
- **Collapsible**: Colors and Prefabs sections toggle with click; entire sidebar collapses with Tab key
- **Color selection**: Clicking a color switches to brush mode and selects that color
- **Prefab selection**: Clicking a prefab enters prefab mode; Escape cancels back to brush

Verification: `tsc --noEmit` clean, 207 tests passing.

---

## 2026-02-19: Core & Test Simplification (Round 4)

Focused code review of `src/core/`, `src/utils/`, and `tests/`. No behavioral changes.

| Area | Change | Files |
|------|--------|-------|
| Test deduplication | Extracted `addCornerTilePair()` helper to replace 6 identical 16-tile generation loops across test helpers and test files | `tests/core/test-helpers.ts`, `tests/core/matching.test.ts` |
| Test deduplication | Extracted `finalizeWangSet()` helper wrapping repeated `setVariants` + `computeColorDistances` + `setDistanceMatrix` + `setNextHopMatrix` boilerplate | `tests/core/test-helpers.ts`, `tests/core/matching.test.ts` |
| Test deduplication | Extracted `initMapTiles()` helper to replace 8 identical nested init loops across 3 test files | `tests/core/test-helpers.ts`, `tests/core/matching.test.ts`, `tests/core/flood-fill.test.ts`, `tests/core/map-persistence.test.ts` |
| Test cleanup | Replaced inline `WangColor` literals with `makeColor()` calls where applicable | `tests/core/matching.test.ts` |
| Test cleanup | Removed unused `WangColor` type import, `DEFAULT_TRANSFORMATIONS` import | `tests/core/matching.test.ts` |
| Core simplification | Simplified `activeIndices()` from loop-based to direct return of constant arrays | `src/core/wang-id.ts` |
| Core simplification | Extracted `parseCoordKey()` helper to deduplicate manual `indexOf`/`slice` key parsing in `recomputeTiles()` | `src/core/terrain-painter.ts` |
| Core simplification | Consolidated 4 tileset field validations into single loop | `src/core/metadata-loader.ts` |
| Core simplification | Replaced imperative layer-building loops with `Array.from()` in migration functions | `src/core/map-schema.ts`, `src/core/prefab-schema.ts` |
| Comment cleanup | Simplified misleading comment about opposite index in `wangIdFromSurroundings()` | `src/core/matching.ts` |

Verification: `tsc --noEmit` clean, 207 tests passing.

---

## 2026-02-19: Editor Panel Simplification (Round 5)

Focused simplification of `src/editor/` and `src/editor/panels/`. Extracted shared DOM construction helpers to reduce repetitive element creation code across all panels. No behavioral changes.

| Area | Change | Files |
|------|--------|-------|
| Shared helpers | Created `dom-helpers.ts` with reusable element factories: `sectionHeader()`, `panelButton()`, `deleteButton()`, `badge()`, `probabilityBadge()`, `selectInput()`, `numberInput()`, `textInput()`, `applyTabStyle()` | New `src/editor/dom-helpers.ts` |
| Style deduplication | Extracted 8 shared CSS style constants (`PANEL_BTN_STYLE`, `DANGER_BTN_STYLE`, `SELECT_STYLE`, etc.) replacing 20+ inline duplicates | `src/editor/dom-helpers.ts` |
| Tab style deduplication | Unified tab styling via shared `applyTabStyle()`, replacing 3 identical inline tab style implementations | `tileset-panel.ts`, `tile-editor.ts` |
| Panel decomposition | Broke monolithic `render()` in WangSetPanel into focused sub-methods: `createWangSetEntry()`, `createWangSetHeader()`, `createColorsSection()`, `createSetRepTileButton()`, `createRepTileThumbnail()` | `wangset-panel.ts` |
| Panel decomposition | Broke monolithic `renderAnimationSection()` in InspectorPanel into focused sub-methods: `createAnimatedCheckbox()`, `createAnimationControls()`, `createFrameSlotsGrid()`, `createFrameSlot()`, `createPopulateRow()`, `createAnimationButtons()`, `createAnimationPreview()` | `inspector-panel.ts` |
| Panel decomposition | Extracted `createRightPanel()` from TileEditor constructor to isolate right-panel layout logic | `tile-editor.ts` |
| Inline rename dedup | Generalized `startInlineRename()` in WangSetPanel to accept a callback, replacing separate WangSet/Color rename implementations | `wangset-panel.ts` |
| Region panel cleanup | Extracted `readColorSelections()`, `createPatternSelect()`, `createCopyPasteRow()` from monolithic `render()` | `region-assign-panel.ts` |
| Template panel cleanup | Removed private `selectStyle()` method (replaced by shared `SELECT_STYLE` constant) | `template-panel.ts` |
| Import cleanup | Removed unused `PANEL_BTN_STYLE`, `INPUT_STYLE` imports from consumer files | `inspector-panel.ts`, `wangset-panel.ts` |

Verification: `tsc --noEmit` clean, 207 tests passing.

---

## 2026-02-19: Engine & Map Painter Simplification (Round 6)

Focused simplification of `src/engine/game-scene.ts` and `src/map-painter-main.ts`. No behavioral changes.

| Area | Change | Files |
|------|--------|-------|
| Deduplication | Extracted `setButtonActive()` module-level helper replacing 4 duplicated update methods | `game-scene.ts` |
| Deduplication | Extracted `cellFromPrefabTile()` helper replacing repeated `createCell(tile.tileId, false, false, false, tile.tilesetIndex)` | `game-scene.ts` |
| Deduplication | Extracted `forEachPrefabTile()` method consolidating triple-nested loop in preview/place/load (~30 lines eliminated) | `game-scene.ts` |
| Deduplication | Consolidated `undoPrefab()`/`redoPrefab()` via shared `swapCellSnapshots()` method | `game-scene.ts` |
| Deduplication | Extracted `postMap()` method for shared fetch call from autosave/saveMap | `game-scene.ts` |
| Readability | Named `CellSnapshot` interface for undo/redo entries | `game-scene.ts` |
| Readability | Extracted `VISIBILITY_ORDER` constant and `addLayer` local helper | `game-scene.ts` |
| Simplification | Simplified `applyVisibility` with ternary for `inactiveOpacity` | `game-scene.ts` |

Verification: `tsc --noEmit` clean, 207 tests passing.

---

## 2026-02-19: Prefab Editor Simplification (Round 7)

Focused simplification of `src/prefab/`. Extracted shared canvas helpers and decomposed large methods. No behavioral changes.

| Area | Change | Files |
|------|--------|-------|
| Shared helpers | Created `canvas-helpers.ts` with `buildCanvasLayout()`, `drawGridLines()`, `attachWheelZoom()` | New `src/prefab/canvas-helpers.ts` |
| State cleanup | Extracted `clampZoom()`, `findTileIndex()`, `emptyLayers()`, `allLayerBounds()` helpers | `prefab-state.ts` |
| Canvas cleanup | Refactored to use `canvas-helpers`, extracted `cursorColorForTool()` helper | `prefab-canvas.ts` |
| Tileset viewer | Refactored to use shared `canvas-helpers` for layout/grid/zoom | `tileset-viewer.ts` |
| Editor cleanup | Extracted `handleKeydown()` and `toggleTool()` from monolithic constructor | `prefab-editor.ts` |
| List panel | Reused `startInlineEdit()` pattern, extracted server API methods | `prefab-list-panel.ts` |

Verification: `tsc --noEmit` clean, 207 tests passing.

---

## 2026-02-19: Pan/Zoom + Resizable Maps for Map Painter

Added camera pan/zoom controls, 64x64 default map size, and directional resize buttons to the map painter.

| Task | Status | Notes |
|------|--------|-------|
| Pure resize functions | Done | `src/core/map-resize.ts` — `resizeColorArray()` (expand/shrink with offset), `shiftPlacedPrefab()` |
| Resize tests | Done | `tests/core/map-resize.test.ts` — 13 tests (expand/shrink all 4 directions, fill color, identity, prefab shift) |
| Mutable map dimensions | Done | `GameScene` uses instance fields `mapCols`/`mapRows` instead of hardcoded constants; default 64x64 |
| Pan/zoom | Done | Scroll to pan, Ctrl/Cmd+Scroll to zoom (0.5x–6x), Home key resets camera; default zoom 1.5 |
| Tilemap rebuild | Done | `rebuildTilemaps()` destroys and recreates all 14 tilemaps (9 map + 5 preview) at new dimensions |
| Directional resize | Done | `resizeMap(direction, delta)` — expand/shrink by 10 tiles per direction, minimum 10x10 |
| Map sidebar section | Done | At bottom of sidebar: Increase/Decrease tab toggle, diamond N/W/E/S buttons, size label in header |
| Load at saved size | Done | `loadMapByFilename()` rebuilds tilemaps if saved dimensions differ from current |

### Architecture

- **Resize flow**: Extract colors → rebuild tilemaps → resize colors with `resizeColorArray()` → load colors → shift prefabs → adjust camera
- **Pan/zoom**: Wheel listener on `engine.canvas` with `passive: false`. Pan modifies `camera.pos`, zoom modifies `camera.zoom`.
- **Excalibur constraint**: `TileMap` cannot resize after creation, so resize destroys all tilemaps and recreates them.

Verification: `tsc --noEmit` clean, 220 tests passing.

---

## 2026-02-19: Remove V1 Migration Code

Removed all v1→v2 migration code for maps and prefabs. Only v2 format is supported.

| Removed | Files |
|---------|-------|
| `SavedMapV1` interface, `migrateMapV1toV2()` | `src/core/map-schema.ts` |
| `SavedPrefabV1` interface, `migratePrefabV1toV2()` | `src/core/prefab-schema.ts` |
| V1 migration tests (7 tests) | `tests/core/layer-migration.test.ts` |
| `SavedPrefabV1` type reference | `src/prefab-editor-main.ts` |

`parseSavedMap()` and `parseSavedPrefab()` remain as v2 normalizers (pad layers, default `placedPrefabs`).

Verification: `tsc --noEmit` clean, 213 tests passing.

---

## 2026-02-19: Erase Color + Brush Sizes

Added erase as a color option and configurable brush sizes to the map painter.

| Change | Details |
|--------|---------|
| Erase color | "Erase" entry (color 0) shown first in Colors section, `E` keyboard shortcut, switches to brush tool |
| Brush sizes | 1x1, 3x3, 10x10 size buttons in Tools section, applies to both brush and erase |
| InputHandler | `BrushSize` type, `setBrushSize()`, NxN painting loop centered on cursor tile; OOB tiles safely ignored by `setColorAt` bounds check |

Verification: `tsc --noEmit` clean, 213 tests passing.

---

## 2026-02-19: Map Generator — 2D Simplex Noise

Added seeded 2D simplex noise implementation as a building block for procedural map generation.

| Task | Status | Notes |
|------|--------|-------|
| SimplexNoise class | Done | `src/core/simplex-noise.ts` — standard 2D simplex (Perlin/Gustavson), Fisher-Yates shuffled permutation table from `SeededRandom`, output scaled by 70 to [-1, 1] |
| Simplex noise tests | Done | `tests/core/simplex-noise.test.ts` — 4 tests (range, determinism, seed divergence, spatial variation) |

Verification: `tsc --noEmit` clean, 217 tests passing.

---

## 2026-02-19: Map Generator — Noise + Voronoi Generation with Biome Transitions

Core map generation functions for procedural terrain. Two algorithms (noise-based and voronoi-based) produce base biome layouts from weighted biome configs, then `insertIntermediates` smooths biome borders using the WangSet's color distance graph.

| Task | Status | Notes |
|------|--------|-------|
| `generateNoise()` | Done | `src/core/map-generator.ts` — multi-octave simplex noise thresholded into biomes by cumulative weight |
| `generateVoronoi()` | Done | `src/core/map-generator.ts` — scatter seed points proportional to weights, nearest-neighbor assignment |
| `generateMap()` | Done | `src/core/map-generator.ts` — base colors + `insertIntermediates()` for smooth biome border transitions |
| Interfaces | Done | `BiomeConfig` (colorId + weight), `GeneratorSettings` (algorithm, dimensions, seed, biomes, scale, pointCount) |
| Tests | Done | `tests/core/map-generator.test.ts` — 12 tests (length, valid IDs, determinism, seed divergence, weight ratios, all colors used, generateMap integration) |

Verification: `tsc --noEmit` clean, 233 tests passing.

---

## 2026-02-19: Map Generator UI

Full generator tool page at `/tools/map-generator/` with settings panel and live canvas preview.

| Task | Status | Notes |
|------|--------|-------|
| GeneratorUI class | Done | `src/generator/generator-ui.ts` — standalone page with left settings panel (280px) + right preview canvas |
| Algorithm toggle | Done | Noise / Voronoi buttons with conditional Scale (noise) and Point Count (voronoi) controls |
| Biomes section | Done | Per-color checkbox + colored swatch + name + weight slider (1-100); first 3 checked by default |
| Map size inputs | Done | Width/height number inputs, default 64, clamped 10-256 |
| Seed control | Done | Number input + Randomize button |
| Scale slider | Done | Range 0.01-0.2, default 0.05, shown only for noise algorithm |
| Point count slider | Done | Range 5-100, default 30, shown only for voronoi algorithm |
| Generate button | Done | Builds `GeneratorSettings`, calls `generateMap()`, renders preview with timing feedback |
| Preview canvas | Done | Cell size auto-fitted to available space, colors from WangSet with `wangColorHex()` fallback |
| Save flow | Done | Text input for name + Save button (disabled until generated), builds `SavedMap` v2, POSTs to `/api/save-map` |
| Feedback overlay | Done | Fixed-position toast for success/error messages with fade-out |
| Entry point update | Done | `src/map-generator-main.ts` — loads metadata, instantiates `GeneratorUI` |
| Dark theme | Done | Matches project dark theme (`#1a1a2e` background, `#16213e` panels, `#6666cc` accent) |

Verification: `tsc --noEmit` clean, 233 tests passing.
