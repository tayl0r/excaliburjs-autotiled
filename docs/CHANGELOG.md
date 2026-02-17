# Implementation Status — Plans vs. Codebase

> Compares the original specification documents and implementation plans in `./docs/`
> against what is actually implemented in `src/`. Last updated: 2026-02-17.

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
| Project management (create/open, register tilesets) | Not done | Single hardcoded tileset only (`terrain.autotile.json`) |
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
| Adjacency preview (3x3 grid) | Done | `src/editor/adjacency-preview.ts` — wired into inspector panel |
| Transformation configuration (flip H/V, rotation) | Done | Checkboxes in WangSet panel with impact multiplier display |
| Transformation preview (show all variants) | Not done | No UI to view generated variants for a selected tile |
| Animation frame support | Done | `src/editor/panels/animation-panel.ts` — frame sync, offset editing, auto-copy tags |
| Layout pattern definitions | Partial | 2 patterns defined (Standard 4x4 Binary, Fantasy 1x16); RPG Maker VX and custom pattern creation not implemented |
| Save/load metadata JSON files | Partial | Auto-save to server endpoint works (5s debounce); no manual save, load dialog, or standalone JSON export |
| Multi-tileset workflow (tabbed interface) | Not done | Single tileset only |
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
| `P` toggle adjacency preview | Yes | Not done |

---

## JSON Schema (`AUTOTILE_JSON_SCHEMA.md`)

| Item | Status | Notes |
|------|--------|-------|
| Per-tileset metadata file format | Done | `src/core/metadata-schema.ts` — TypeScript interfaces match the spec |
| Top-level fields (image, dimensions, columns, tileCount) | Done | |
| Transformations object | Done | allowRotate, allowFlipH, allowFlipV, preferUntransformed |
| WangSet with name, type, colors, wangtiles | Done | |
| WangColor with name, color, probability, tile | Done | |
| WangTile with tileid and 8-element wangid | Done | |
| Animation sequences (name, frames, duration, pattern) | Done | |
| Validation rules (Section 5) | Partial | Type-constraint validation on load; no real-time duplicate-tileid warning in editor |
| Project file format (Section 3) | Not done | No project file support |

---

## TimeFantasy Asset Guide (`TIMEFANTASY_ASSET_GUIDE.md`)

| Item | Status | Notes |
|------|--------|-------|
| Ground Terrain WangSet (Grass/Dirt/Sand/Rock) | Done | Configured in `terrain.autotile.json` with tile probabilities |
| Water WangSet (3-frame animated, ping-pong) | Not done | Animation panel exists but no water tileset is tagged |
| Forest Canopy WangSet | Not done | No `outside.png` tileset loaded |
| Cliff/Mountain handling | Not done | |
| Desert Terrain WangSet | Not done | No `desert.png` tileset loaded |
| Dungeon Floor WangSet | Not done | No `dungeon.png` tileset loaded |
| Castle Floor WangSet | Not done | No `castle.png` tileset loaded |

Only the ground terrain tileset has been authored. The remaining asset authoring depends on multi-tileset support.

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
- Inspector panel with 8-zone WangId editor
- Template panel with 4x4 grid and auto-fill
- WangSet and WangColor CRUD (state + UI)
- Completeness validation with status display
- Adjacency preview (3x3 grid)
- Color overlay rendering
- Transformation configuration UI
- Animation panel with frame sync
- Region auto-detect (2 layout patterns)
- All three implementation plans (2026-02-16 x2, 2026-02-17)
- Ground terrain asset authoring (terrain.autotile.json)

### Partially Complete

- **Keyboard shortcuts** — core set implemented, several from spec missing (Delete, Space, P, +/-)
- **Tile filter** — tagged/untagged/all works, no per-WangSet filter
- **Layout patterns** — 2 of 3+ planned patterns defined (missing RPG Maker VX, custom creation)
- **Save/load** — auto-save works, no manual save/load/export UI
- **Validation** — completeness checking works, no real-time duplicate WangId warning

### Not Started

- **Project management** — no multi-tileset project workflow
- **Multi-tileset editor** — single tileset only, no tabbed interface
- **Transformation preview** — no UI to view generated variants
- **Asset authoring** for Water, Forest, Cliff, Desert, Dungeon, Castle tilesets
