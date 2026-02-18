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

### Partially Complete

- **Keyboard shortcuts** — core set implemented, several from spec missing (Delete, Space, P, +/-)
- **Tile filter** — tagged/untagged/all works, no per-WangSet filter
- **Layout patterns** — 2 of 3+ planned patterns defined (missing RPG Maker VX, custom creation)
- **Save/load** — auto-save works, no manual save/load/export UI
- **Validation** — completeness checking works, no real-time duplicate WangId warning
- **Multi-tileset editor** — data model, editor state, and tileset tab bar all working; wangtile tagging scoped to active tileset
- **Multi-spritesheet runtime** — SpriteResolver and TilesetManager support multiple spritesheets; all tileset images loaded at startup

### Not Started

- **Transformation preview** — no UI to view generated variants
- **Asset authoring** for Water, Forest, Cliff, Desert, Dungeon, Castle tilesets
