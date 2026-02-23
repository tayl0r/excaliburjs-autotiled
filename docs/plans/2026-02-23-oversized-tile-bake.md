# Oversized Tile Bake Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the bake pipeline handle tilesets with non-16x16 tiles (e.g. 60x64 monster sprites), packing them into aligned blocks in the atlas and emitting metadata for consumers.

**Architecture:** TileRegistry gains tileset awareness to track source dimensions. buildAtlas packs normal 16x16 tiles first, then oversized tiles in contiguous rectangular blocks. generateIndex emits an `oversizeTiles` table with atlas positions and render offsets (bottom-center anchored). A `finalize()` step reassigns baked IDs so normal tiles are contiguous 1..N, ensuring the consumer's `(bakedId-1) % columns` formula works.

**Tech Stack:** TypeScript, sharp (image processing), vitest

---

### Task 1: TileRegistry — Track Tile Dimensions

**Files:**
- Modify: `scripts/bake-lib.ts` (TileEntry interface + TileRegistry class, lines 30-63)
- Test: `tests/scripts/bake.test.ts`

**Step 1: Write failing tests**

Add to `tests/scripts/bake.test.ts`, near the top with other imports:

```typescript
import type { TilesetDef } from '@core/metadata-schema.js';
```

Add a helper function before the TileRegistry describe block:

```typescript
function makeTilesetDefs(...sizes: [number, number][]): TilesetDef[] {
  return sizes.map(([w, h]) => ({
    tilesetImage: 'test.png',
    tileWidth: w,
    tileHeight: h,
    columns: 10,
    tileCount: 100,
  }));
}
```

Add these tests inside the existing `describe('TileRegistry', ...)` block:

```typescript
it('tracks source dimensions from tileset metadata', () => {
  const defs = makeTilesetDefs([16, 16], [60, 64]);
  const registry = new TileRegistry(defs);
  registry.register(createCell(0, false, false, false, 0));
  registry.register(createCell(0, false, false, false, 1));
  const entries = registry.entries();
  expect(entries[0].sourceWidth).toBe(16);
  expect(entries[0].sourceHeight).toBe(16);
  expect(entries[1].sourceWidth).toBe(60);
  expect(entries[1].sourceHeight).toBe(64);
});

it('defaults to TILE_SIZE when no tileset defs provided', () => {
  const registry = new TileRegistry();
  registry.register(createCell(0, false, false, false, 0));
  const entries = registry.entries();
  expect(entries[0].sourceWidth).toBe(TILE_SIZE);
  expect(entries[0].sourceHeight).toBe(TILE_SIZE);
});

it('reports oversized tiles', () => {
  const defs = makeTilesetDefs([16, 16], [60, 64]);
  const registry = new TileRegistry(defs);
  registry.register(createCell(0, false, false, false, 0));
  registry.register(createCell(0, false, false, false, 1));
  const entries = registry.entries();
  expect(registry.isOversized(entries[0])).toBe(false);
  expect(registry.isOversized(entries[1])).toBe(true);
});

it('separates normal and oversized entries', () => {
  const defs = makeTilesetDefs([16, 16], [60, 64]);
  const registry = new TileRegistry(defs);
  registry.register(createCell(0, false, false, false, 0));
  registry.register(createCell(5, false, false, false, 0));
  registry.register(createCell(0, false, false, false, 1));
  expect(registry.normalEntries()).toHaveLength(2);
  expect(registry.oversizedEntries()).toHaveLength(1);
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scripts/bake.test.ts`

**Step 3: Implement TileRegistry changes in `scripts/bake-lib.ts`**

Update `TileEntry` to add `sourceWidth` and `sourceHeight` fields.

Update `TileRegistry`:
- Constructor accepts optional `tilesetDefs?: TilesetDef[]`, defaults to `[]`
- `register()` looks up `def.tileWidth`/`def.tileHeight` from `this.tilesetDefs[cell.tilesetIndex]`, falls back to `TILE_SIZE`
- Add `isOversized(entry)`: returns `entry.sourceWidth > TILE_SIZE || entry.sourceHeight > TILE_SIZE`
- Add `normalEntries()`: filters entries where `!isOversized`
- Add `oversizedEntries()`: filters entries where `isOversized`

**Step 4: Run tests**

Run: `npx vitest run tests/scripts/bake.test.ts`

**Step 5: Update callers**

In `scripts/bake.ts`, change `new TileRegistry()` to `new TileRegistry(tilesetDefs)` where `tilesetDefs` comes from the initialized project.

**Step 6: Run full test suite**

Run: `npx vitest run && npx tsc --noEmit`

**Step 7: Commit**

```bash
git add scripts/bake-lib.ts scripts/bake.ts tests/scripts/bake.test.ts
git commit -m "feat(bake): track tile dimensions in TileRegistry"
```

---

### Task 2: TileRegistry — finalize() for Stable Baked ID Ordering

**Files:**
- Modify: `scripts/bake-lib.ts` (TileRegistry class)
- Test: `tests/scripts/bake.test.ts`

The consumer formula `(bakedId - 1) % columns` requires normal tile baked IDs to be contiguous 1..N. If oversized tiles are registered between normal tiles (e.g. a prefab mixes 16x16 and 60x64), IDs would interleave. `finalize()` reassigns IDs so normal tiles always come first.

**Step 1: Write failing tests**

Add to the TileRegistry describe block:

```typescript
it('finalize() remaps IDs so normal tiles come first', () => {
  const defs = makeTilesetDefs([60, 64], [16, 16]);
  const registry = new TileRegistry(defs);
  registry.register(createCell(0, false, false, false, 0)); // oversized → id 1
  registry.register(createCell(0, false, false, false, 1)); // normal → id 2

  const remap = registry.finalize();
  expect(remap.get(1)).toBe(2); // oversized moved from 1 → 2
  expect(remap.get(2)).toBe(1); // normal moved from 2 → 1
  expect(registry.normalEntries()[0].bakedId).toBe(1);
  expect(registry.oversizedEntries()[0].bakedId).toBe(2);
});

it('finalize() is identity when normal tiles already come first', () => {
  const defs = makeTilesetDefs([16, 16], [60, 64]);
  const registry = new TileRegistry(defs);
  registry.register(createCell(0, false, false, false, 0)); // normal → id 1
  registry.register(createCell(0, false, false, false, 1)); // oversized → id 2

  const remap = registry.finalize();
  expect(remap.get(1)).toBe(1);
  expect(remap.get(2)).toBe(2);
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scripts/bake.test.ts`

**Step 3: Implement finalize()**

Add to TileRegistry:

```typescript
/** Reassign IDs: normal tiles 1..N, then oversized N+1..M. Returns old→new remap. */
finalize(): Map<number, number> {
  const normal = [...this.map.values()].filter(e => !this.isOversized(e));
  const oversize = [...this.map.values()].filter(e => this.isOversized(e));
  const remap = new Map<number, number>();
  let id = 1;
  for (const e of normal) { remap.set(e.bakedId, id); e.bakedId = id++; }
  for (const e of oversize) { remap.set(e.bakedId, id); e.bakedId = id++; }
  return remap;
}
```

Add a module-level helper function (exported):

```typescript
/** Apply baked ID remap to all resolved layers. */
export function remapLayers(layers: Uint16Array[], remap: Map<number, number>): void {
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i++) {
      if (layer[i] !== 0) {
        layer[i] = remap.get(layer[i]) ?? layer[i];
      }
    }
  }
}
```

**Step 4: Wire into bake.ts**

In `scripts/bake.ts`, after all maps and prefabs are resolved (all `register()` calls done), add:

```typescript
const remap = registry.finalize();
for (const rm of resolvedMaps) remapLayers(rm.layers, remap);
for (const rp of resolvedPrefabs) remapLayers(rp.layers, remap);
```

Import `remapLayers` from bake-lib.

**Step 5: Run tests**

Run: `npx vitest run && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add scripts/bake-lib.ts scripts/bake.ts tests/scripts/bake.test.ts
git commit -m "feat(bake): finalize() ensures normal tiles get contiguous baked IDs"
```

---

### Task 3: computeAtlasLayout — Account for Oversized Tile Slots

**Files:**
- Modify: `scripts/bake-lib.ts` (computeAtlasLayout function, lines 92-131)
- Test: `tests/scripts/bake.test.ts`

**Step 1: Write failing tests**

Add to the `describe('computeAtlasLayout', ...)` block:

```typescript
it('accounts for oversized tile slots', () => {
  // 10 normal + 1 oversized 4x4 (16 slots) = 26 total
  const layout = computeAtlasLayout(10, [{ slotsWide: 4, slotsTall: 4 }]);
  expect(layout.columns).toBeGreaterThanOrEqual(4); // must fit 4-wide block
  expect(layout.columns * layout.columns).toBeGreaterThanOrEqual(26);
  expect(layout.fileCount).toBe(1);
});

it('handles only oversized tiles (no normal)', () => {
  const layout = computeAtlasLayout(0, [{ slotsWide: 4, slotsTall: 4 }]);
  expect(layout.columns).toBeGreaterThanOrEqual(4);
  expect(layout.fileCount).toBe(1);
});

it('enforces minimum columns for widest oversized tile', () => {
  const layout = computeAtlasLayout(1, [{ slotsWide: 8, slotsTall: 2 }]);
  expect(layout.columns).toBeGreaterThanOrEqual(8);
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scripts/bake.test.ts`

**Step 3: Update computeAtlasLayout**

Add a new interface and update the function signature:

```typescript
export interface OversizeTileSlots {
  slotsWide: number;
  slotsTall: number;
}
```

Update `computeAtlasLayout` to accept optional `oversizeTiles`:

```typescript
export function computeAtlasLayout(
  normalTileCount: number,
  oversizeTiles: OversizeTileSlots[] = [],
): AtlasLayout {
  const oversizeSlotCount = oversizeTiles.reduce(
    (sum, t) => sum + t.slotsWide * t.slotsTall, 0,
  );
  const totalSlots = normalTileCount + oversizeSlotCount;

  if (totalSlots === 0) {
    return { pixelSize: TILE_SIZE, columns: 1, tilesPerFile: 1, fileCount: 0 };
  }

  const maxCols = MAX_ATLAS_PX / TILE_SIZE;
  const maxPerFile = maxCols * maxCols;

  if (totalSlots <= maxPerFile) {
    let cols = 1;
    while (cols * cols < totalSlots) cols *= 2;
    const minCols = oversizeTiles.reduce((max, t) => Math.max(max, t.slotsWide), 0);
    while (cols < minCols) cols *= 2;
    return {
      pixelSize: cols * TILE_SIZE,
      columns: cols,
      tilesPerFile: cols * cols,
      fileCount: 1,
    };
  }

  return {
    pixelSize: MAX_ATLAS_PX,
    columns: maxCols,
    tilesPerFile: maxPerFile,
    fileCount: Math.ceil(totalSlots / maxPerFile),
  };
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/scripts/bake.test.ts`

All existing tests should still pass (second arg defaults to `[]`).

**Step 5: Commit**

```bash
git add scripts/bake-lib.ts tests/scripts/bake.test.ts
git commit -m "feat(bake): computeAtlasLayout accounts for oversized tile slots"
```

---

### Task 4: buildAtlas — Oversized Tile Packing

**Files:**
- Modify: `scripts/bake-lib.ts` (buildAtlas function, lines 356-437; add OversizeTileMeta, AtlasResult, copyTilePixels)
- Modify: `scripts/bake.ts` (update buildAtlas call + pass oversizeTiles to generateIndex)

This is the core change. buildAtlas must:
1. Use tileset metadata `columns`/`tileWidth`/`tileHeight` for source extraction (fixing the bug for all tiles)
2. Pack normal tiles sequentially, then oversized tiles in aligned blocks
3. Return OversizeTileMeta[] for consumer metadata

**Step 1: Add types**

Add to `scripts/bake-lib.ts`:

```typescript
export interface OversizeTileMeta {
  bakedId: number;
  atlasX: number;
  atlasY: number;
  sourceWidth: number;
  sourceHeight: number;
  renderOffsetX: number;
  renderOffsetY: number;
}
```

Update `AtlasResult`:

```typescript
export interface AtlasResult {
  buffers: Buffer[];
  layout: AtlasLayout;
  oversizeTiles: OversizeTileMeta[];
}
```

**Step 2: Extract copyTilePixels helper**

Add before `buildAtlas`:

```typescript
function copyTilePixels(
  srcBuf: Buffer, srcStride: number,
  srcPixelX: number, srcPixelY: number,
  copyWidth: number, copyHeight: number,
  destBuf: Buffer, destStride: number,
  destPixelX: number, destPixelY: number,
  flipH: boolean, flipV: boolean, flipD: boolean,
): void {
  for (let py = 0; py < copyHeight; py++) {
    for (let px = 0; px < copyWidth; px++) {
      let sx = px, sy = py;
      if (flipD) [sx, sy] = [sy, sx];
      if (flipH) sx = copyWidth - 1 - sx;
      if (flipV) sy = copyHeight - 1 - sy;

      const srcOff = ((srcPixelY + sy) * srcStride + (srcPixelX + sx)) * 4;
      const destOff = ((destPixelY + py) * destStride + (destPixelX + px)) * 4;

      destBuf[destOff]     = srcBuf[srcOff];
      destBuf[destOff + 1] = srcBuf[srcOff + 1];
      destBuf[destOff + 2] = srcBuf[srcOff + 2];
      destBuf[destOff + 3] = srcBuf[srcOff + 3];
    }
  }
}
```

**Step 3: Rewrite buildAtlas**

```typescript
export async function buildAtlas(
  registry: TileRegistry,
  tilesetDefs: TilesetDef[],
  tilesetsDir: string,
): Promise<AtlasResult> {
  const normalEntries = registry.normalEntries();
  const oversizedEntries = registry.oversizedEntries();

  const oversizeSlots = oversizedEntries.map(e => ({
    slotsWide: Math.ceil(e.sourceWidth / TILE_SIZE),
    slotsTall: Math.ceil(e.sourceHeight / TILE_SIZE),
  }));

  const layout = computeAtlasLayout(normalEntries.length, oversizeSlots);

  if (layout.fileCount === 0) {
    return { buffers: [], layout, oversizeTiles: [] };
  }

  // Load source tileset raw RGBA buffers
  const tilesetBuffers: { buf: Buffer; width: number }[] = [];
  for (const def of tilesetDefs) {
    const imgPath = join(tilesetsDir, def.tilesetImage);
    const { data, info } = await sharp(imgPath)
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    tilesetBuffers.push({ buf: data, width: info.width });
  }

  const filePx = layout.pixelSize;
  const fileCols = layout.columns;
  const atlasRgba = Buffer.alloc(filePx * filePx * 4);

  // Phase 1: pack normal 16x16 tiles sequentially
  for (let i = 0; i < normalEntries.length; i++) {
    const entry = normalEntries[i];
    const destCol = i % fileCols;
    const destRow = Math.floor(i / fileCols);

    const def = tilesetDefs[entry.tilesetIndex];
    const src = tilesetBuffers[entry.tilesetIndex];
    const srcCol = entry.tileId % def.columns;
    const srcRow = Math.floor(entry.tileId / def.columns);

    copyTilePixels(
      src.buf, src.width,
      srcCol * def.tileWidth, srcRow * def.tileHeight,
      TILE_SIZE, TILE_SIZE,
      atlasRgba, filePx,
      destCol * TILE_SIZE, destRow * TILE_SIZE,
      entry.flipH, entry.flipV, entry.flipD,
    );
  }

  // Phase 2: pack oversized tiles in aligned blocks after normal rows
  const normalRows = normalEntries.length > 0
    ? Math.ceil(normalEntries.length / fileCols)
    : 0;
  let curRow = normalRows;
  let curCol = 0;
  let rowMaxSlotsTall = 0;

  const oversizeMeta: OversizeTileMeta[] = [];

  for (let i = 0; i < oversizedEntries.length; i++) {
    const entry = oversizedEntries[i];
    const slotsW = oversizeSlots[i].slotsWide;
    const slotsH = oversizeSlots[i].slotsTall;

    if (curCol + slotsW > fileCols) {
      curRow += rowMaxSlotsTall;
      curCol = 0;
      rowMaxSlotsTall = 0;
    }

    const destPixelX = curCol * TILE_SIZE;
    const destPixelY = curRow * TILE_SIZE;

    const def = tilesetDefs[entry.tilesetIndex];
    const src = tilesetBuffers[entry.tilesetIndex];
    const srcCol = entry.tileId % def.columns;
    const srcRow = Math.floor(entry.tileId / def.columns);

    copyTilePixels(
      src.buf, src.width,
      srcCol * def.tileWidth, srcRow * def.tileHeight,
      entry.sourceWidth, entry.sourceHeight,
      atlasRgba, filePx,
      destPixelX, destPixelY,
      entry.flipH, entry.flipV, entry.flipD,
    );

    oversizeMeta.push({
      bakedId: entry.bakedId,
      atlasX: destPixelX,
      atlasY: destPixelY,
      sourceWidth: entry.sourceWidth,
      sourceHeight: entry.sourceHeight,
      renderOffsetX: -Math.floor((entry.sourceWidth - TILE_SIZE) / 2),
      renderOffsetY: -(entry.sourceHeight - TILE_SIZE),
    });

    curCol += slotsW;
    rowMaxSlotsTall = Math.max(rowMaxSlotsTall, slotsH);
  }

  const pngBuf = await sharp(atlasRgba, {
    raw: { width: filePx, height: filePx, channels: 4 },
  }).png().toBuffer();

  return { buffers: [pngBuf], layout, oversizeTiles: oversizeMeta };
}
```

**Step 4: Update bake.ts**

Destructure `oversizeTiles` from `buildAtlas` result. Pass it to `generateIndex` (added in Task 5).

**Step 5: Run tests**

Run: `npx vitest run && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add scripts/bake-lib.ts scripts/bake.ts
git commit -m "feat(bake): pack oversized tiles in aligned atlas blocks"
```

---

### Task 5: generateIndex — Emit oversizeTiles Metadata

**Files:**
- Modify: `scripts/bake-lib.ts` (generateIndex function, lines 443-529)
- Modify: `scripts/bake.ts` (pass oversizeTiles to generateIndex)
- Test: `tests/scripts/bake.test.ts`

**Step 1: Write failing tests**

Add a new describe block:

```typescript
import { generateIndex } from '../../scripts/bake-lib.js';
import type { OversizeTileMeta, AtlasLayout } from '../../scripts/bake-lib.js';

describe('generateIndex', () => {
  const baseLayout: AtlasLayout = {
    pixelSize: 256, columns: 16, tilesPerFile: 256, fileCount: 1,
  };

  it('includes oversizeTiles when present', () => {
    const meta: OversizeTileMeta[] = [{
      bakedId: 5, atlasX: 64, atlasY: 128,
      sourceWidth: 60, sourceHeight: 64,
      renderOffsetX: -22, renderOffsetY: -48,
    }];
    const output = generateIndex([], [], baseLayout, 10, meta);
    expect(output).toContain('oversizeTiles');
    expect(output).toContain('atlasX: 64');
    expect(output).toContain('sourceWidth: 60');
    expect(output).toContain('renderOffsetX: -22');
  });

  it('emits empty oversizeTiles when none present', () => {
    const output = generateIndex([], [], baseLayout, 10, []);
    expect(output).toContain('oversizeTiles: {}');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scripts/bake.test.ts`

**Step 3: Update generateIndex**

Add `oversizeTiles` parameter (default `[]`):

```typescript
export function generateIndex(
  maps: ResolvedMap[],
  prefabs: ResolvedPrefab[],
  layout: AtlasLayout,
  tileCount: number,
  oversizeTiles: OversizeTileMeta[] = [],
): string {
```

In the atlas object generation, after the `tilesPerFile` line, add the oversizeTiles block:

```typescript
let oversizeLines: string;
if (oversizeTiles.length === 0) {
  oversizeLines = '  oversizeTiles: {} as Record<number, { atlasX: number; atlasY: number; sourceWidth: number; sourceHeight: number; renderOffsetX: number; renderOffsetY: number }>,';
} else {
  const entries = oversizeTiles.map(o =>
    `    ${o.bakedId}: { atlasX: ${o.atlasX}, atlasY: ${o.atlasY}, sourceWidth: ${o.sourceWidth}, sourceHeight: ${o.sourceHeight}, renderOffsetX: ${o.renderOffsetX}, renderOffsetY: ${o.renderOffsetY} },`
  ).join('\n');
  oversizeLines = `  oversizeTiles: {\n${entries}\n  } as Record<number, { atlasX: number; atlasY: number; sourceWidth: number; sourceHeight: number; renderOffsetX: number; renderOffsetY: number }>,`;
}
```

Add `oversizeLines` to the atlas object output lines.

**Step 4: Update bake.ts**

Pass `oversizeTiles` from `buildAtlas` result to `generateIndex`.

**Step 5: Run tests**

Run: `npx vitest run && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add scripts/bake-lib.ts scripts/bake.ts tests/scripts/bake.test.ts
git commit -m "feat(bake): emit oversizeTiles metadata in generated index"
```

---

### Task 6: generateReadme — Document Oversized Tiles

**Files:**
- Modify: `scripts/bake-lib.ts` (generateReadme function)

**Step 1: Add oversized tile section to README template**

After the Atlas section in `generateReadme`, add:

```markdown
## Oversized Tiles

Some tiles (e.g., 60×64 monster sprites) are larger than the standard ${TILE_SIZE}×${TILE_SIZE} grid size. These are packed in aligned blocks in the atlas and listed in `atlas.oversizeTiles`.

For oversized tiles, use the metadata instead of the standard formula:

\`\`\`typescript
function getTileRect(bakedId: number) {
  const oversize = atlas.oversizeTiles[bakedId];
  if (oversize) {
    return {
      x: oversize.atlasX,
      y: oversize.atlasY,
      width: oversize.sourceWidth,
      height: oversize.sourceHeight,
    };
  }
  const index = bakedId - 1;
  return {
    x: (index % atlas.columns) * atlas.tileWidth,
    y: Math.floor(index / atlas.columns) * atlas.tileHeight,
    width: atlas.tileWidth,
    height: atlas.tileHeight,
  };
}
\`\`\`

Oversized tiles are bottom-center anchored to their 16×16 grid cell. Apply the render offsets when positioning:

\`\`\`typescript
const oversize = atlas.oversizeTiles[bakedId];
if (oversize) {
  sprite.x = cellX * 16 + oversize.renderOffsetX;
  sprite.y = cellY * 16 + oversize.renderOffsetY;
}
\`\`\`
```

**Step 2: Run tests**

Run: `npx vitest run && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add scripts/bake-lib.ts
git commit -m "docs(bake): document oversized tiles in generated README"
```

---

### Task 7: Update Slime Prefab

**Files:**
- Modify: `assets/prefabs/slime.json`

**Step 1: Simplify slime prefab**

Replace the current 12-entry prefab with a single tile:

```json
{
  "version": 2,
  "name": "slime",
  "layers": [
    [],
    [
      {
        "x": 6,
        "y": 5,
        "tileId": 0,
        "tilesetIndex": 9
      }
    ],
    [],
    [],
    []
  ],
  "anchorX": 6,
  "anchorY": 5
}
```

This references tileId 0 from tilesetIndex 9 (monster3.png) — a single 60×64 monster sprite.

**Step 2: Run bake pipeline**

Run: `npm run bake`

Verify:
- Pipeline completes without error
- `dist/baked/tileset-0.png` includes the 60×64 sprite in a 64×64 block
- `dist/baked/index.ts` contains `oversizeTiles` with the slime's baked ID

**Step 3: Commit**

```bash
git add assets/prefabs/slime.json
git commit -m "fix(prefab): simplify slime to single 60x64 monster tile"
```

---

### Task 8: Integration Test Verification

**Files:**
- Test: `tests/scripts/bake-integration.test.ts`

**Step 1: Run existing integration tests**

Run: `npx vitest run tests/scripts/bake-integration.test.ts`

The existing integration tests run the full bake pipeline on real assets. They should pass with the oversized tile changes. If any fail, investigate and fix.

**Step 2: Run full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`

**Step 3: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(bake): fix integration test issues from oversized tile support"
```

---

### Task 9: Update Documentation

**Files:**
- Modify: `docs/DATA_MODEL.md`
- Modify: `docs/CHANGELOG.md`

**Step 1: Update DATA_MODEL.md**

In the "Baked Output" section, under "Atlas PNG", add after the existing bullet points:

```markdown
- **Oversized tiles**: Tiles larger than 16×16 (e.g., 60×64 monster sprites) are packed in aligned blocks after normal tiles. A 60×64 tile occupies a 4×4 block (64×64 pixels). Their positions are listed in `atlas.oversizeTiles` rather than derived from baked ID.
- **Render offsets**: Oversized tiles are bottom-center anchored to their 16×16 grid cell. `renderOffsetX` centers horizontally, `renderOffsetY` aligns the bottom edge. For 60×64: offsetX=-22, offsetY=-48.
```

In the "index.ts" subsection, update the `atlas` description:

```markdown
- `atlas` — metadata: version, tileWidth, tileHeight, files[], columns, tileCount, tilesPerFile, oversizeTiles (map of bakedId → atlas position + source rect + render offsets)
```

**Step 2: Update CHANGELOG.md**

Add a new section:

```markdown
## 2026-02-23: Oversized Tile Bake Support

Added support for baking non-16×16 tiles (e.g., 60×64 monster sprites). Oversized tiles are packed in aligned blocks in the atlas, and consumer metadata includes source rects and render offsets.

| Task | Status | Notes |
|------|--------|-------|
| TileRegistry dimension tracking | Done | `sourceWidth`/`sourceHeight` on TileEntry, `isOversized()`, `normalEntries()`/`oversizedEntries()` |
| Baked ID stabilization | Done | `finalize()` reassigns IDs so normal tiles are contiguous 1..N, `remapLayers()` updates binary data |
| Atlas layout sizing | Done | `computeAtlasLayout` accounts for oversized block slots, enforces minimum columns |
| Atlas packing | Done | Two-phase: normal tiles sequential, oversized in aligned blocks; source extraction uses tileset metadata |
| Generated index metadata | Done | `atlas.oversizeTiles` table with atlasX/Y, sourceWidth/Height, renderOffsetX/Y |
| Generated README | Done | Documents oversized tile lookup and render offset usage |
| Slime prefab | Done | Simplified from 12 sub-tile entries to single 60×64 monster tile |

**Design doc:** `docs/plans/2026-02-23-oversized-tile-bake-design.md`
```

**Step 3: Commit**

```bash
git add docs/DATA_MODEL.md docs/CHANGELOG.md
git commit -m "docs: update DATA_MODEL and CHANGELOG for oversized tile support"
```
