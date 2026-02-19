# Project Guidelines

## Commands

```bash
npm run dev          # Vite dev server on port 5200
npm run build        # tsc && vite build
npm test             # vitest run (all tests)
npm run test:watch   # vitest in watch mode
npx tsc --noEmit     # typecheck only (no emit)
```

Always run `tsc --noEmit` and `vitest run` before considering work complete.

## Architecture

Multi-page app with three tools sharing a core autotile engine:

- **`src/core/`** — Pure logic, no DOM or Excalibur deps. Wang tiles, matching, terrain painting, color distance, flood fill.
- **`src/engine/`** — Excalibur runtime. `AutotileTilemap` bridges core autotile logic to Excalibur's `TileMap`. `GameScene` is the map painter scene.
- **`src/editor/`** — Standalone tileset metadata editor. `EditorState` is the central store with pub/sub events. Panels in `src/editor/panels/`.
- **`src/prefab/`** — Prefab editor. `PrefabEditorState` manages prefab CRUD and tools (paint, erase, move, copy, anchor). `PrefabCanvas` handles rendering and mouse interaction. `PrefabEditor` builds the UI.
- **`src/utils/`** — Shared helpers (asset path resolution, tileset image loading).
- **Entry points:** `src/tileset-editor-main.ts` (`/tools/tileset-editor/`), `src/map-painter-main.ts` (`/tools/map-painter/`), `src/prefab-editor-main.ts` (`/tools/prefab-editor/`)
- **Vite plugins** in `vite.config.ts` provide dev-server API endpoints for saving metadata, maps, and prefabs.

## Path Aliases

Vite/TypeScript path aliases: `@core` → `src/core`, `@engine` → `src/engine`, `@editor` → `src/editor`, `@utils` → `src/utils`.

## Documentation

- `docs/DATA_MODEL.md` — On-disk formats and runtime data structures
- `docs/specs/` — Original project specs (autotile engine, JSON schema, tile metadata editor)
- `docs/plans/` — Implementation plans for features

## Testing

Tests use vitest. Files live in `tests/` mirroring `src/` structure (e.g. `tests/core/matching.test.ts`). Shared test helpers in `tests/core/test-helpers.ts` (`createGrassDirtWangSet`, `createThreeColorWangSet`, `makeColor`).

## After Completing Work

After finishing any feature, bugfix, or implementation task, update `docs/CHANGELOG.md` to reflect the new status. Mark completed items as "Done" and add notes about what was implemented. This file tracks plan-vs-implementation status and must stay current.

When a new plan is added to `docs/plans/`, add a corresponding section to the CHANGELOG. The CHANGELOG references every spec and plan file in `docs/` — if those files are added, removed, or restructured, update the CHANGELOG to match.

## Asset Migrations

When removing or changing on-disk data formats (e.g. removing v1 migration code), always migrate existing asset files in `assets/` to the new format and save them to disk. Never leave stale assets that the code can no longer read.

## Git Workflow

Do not use git worktrees in this project. Work on the main branch or simple feature branches only.
