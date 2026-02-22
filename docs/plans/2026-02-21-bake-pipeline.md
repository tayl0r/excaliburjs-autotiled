# Tile Bake Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI script that extracts only in-use tiles from source PNGs into a compact atlas, resolves all map/prefab tiles at build time, and outputs binary data + typed TypeScript loaders for engine-agnostic consumption.

**Architecture:** Standalone Node script (`scripts/bake.ts`) reads project metadata + source PNGs, runs WangSet matching to resolve map colors → concrete tiles, collects all unique tile sprites across maps and prefabs, packs them into square power-of-2 atlas PNG(s) via sharp, and writes binary tile data + a typed TypeScript index module.

**Tech Stack:** Node.js 24+ with `--experimental-strip-types`, sharp (already a devDep), imports from `src/core/` (pure logic, no DOM deps).

---

### Task 1: Add `tsx` dependency and `bake` npm script

Since `moduleResolution: "bundler"` in tsconfig is incompatible with Node's native TS stripping, use `tsx` which handles bundler-style resolution and path aliases via tsconfig.

**Files:**
- Modify: `package.json`

**Step 1: Install tsx**

Run: `npm install --save-dev tsx`

**Step 2: Add bake script to package.json**

Add to `scripts`:
```json
"bake": "tsx scripts/bake.ts"
```

**Step 3: Add `dist/baked` to .gitignore**

Append `dist/baked/` to `.gitignore` (create if needed).

**Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add tsx and bake npm script"
```

---

### Task 2: Create the bake script skeleton with seeded PRNG

The bake script needs deterministic output. `RandomPicker` in `src/core/random-picker.ts` calls `Math.random()` directly (line 16). We monkey-patch `Math.random` with a seeded mulberry32 PRNG before any core imports execute.

**Files:**
- Create: `scripts/bake.ts`

**Step 1: Write the bake script skeleton**

```typescript
#!/usr/bin/env tsx
/**
 * Tile Bake Pipeline
 * Extracts in-use tiles from source PNGs, packs into atlas(es),
 * and outputs binary tile data + typed TypeScript loaders.
 *
 * Usage: npm run bake
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { glob } from 'node:fs/promises';
import sharp from 'sharp';

// --- Seeded PRNG (must be before any core imports that use Math.random) ---
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seededRandom = mulberry32(42);
Math.random = seededRandom;

// --- Core imports (after PRNG patch) ---
import type { ProjectMetadata, TilesetDef } from '../src/core/metadata-schema.js';
import { loadMetadata } from '../src/core/metadata-loader.js';
import { generateAllVariants } from '../src/core/variant-generator.js';
import { computeColorDistances } from '../src/core/color-distance.js';
import { SimpleAutotileMap } from '../src/core/autotile-map.js';
import { resolveAllTiles } from '../src/core/terrain-painter.js';
import { cellSpriteKey, isCellEmpty } from '../src/core/cell.js';
import type { Cell } from '../src/core/cell.js';
import type { SavedMap, PlacedPrefab } from '../src/core/map-schema.js';
import { parseSavedMap } from '../src/core/map-schema.js';
import type { SavedPrefab, PrefabTile } from '../src/core/prefab-schema.js';
import { parseSavedPrefab } from '../src/core/prefab-schema.js';
import { NUM_MAP_LAYERS, NUM_PREFAB_LAYERS } from '../src/core/layers.js';

// --- Constants ---
const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const ASSETS_DIR = join(PROJECT_ROOT, 'assets');
const TILESETS_DIR = join(ASSETS_DIR, 'TimeFantasy_TILES_6.24.17', 'TILESETS');
const OUTPUT_DIR = join(PROJECT_ROOT, 'dist', 'baked');
const TILE_SIZE = 16;
const MAX_ATLAS_SIZE = 2048;
const MAX_TILES_PER_ATLAS = (MAX_ATLAS_SIZE / TILE_SIZE) ** 2; // 16384

async function main() {
  console.log('Bake pipeline starting...');

  // 1. Load project metadata
  const metadataPath = join(ASSETS_DIR, 'project.autotile.json');
  const metadataJson: ProjectMetadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
  const { wangSets, transformations } = loadMetadata(metadataJson);

  // Initialize each WangSet (variants + distance matrices)
  for (const ws of wangSets) {
    const variants = generateAllVariants(ws, transformations);
    ws.setVariants(variants);
    const { distances, nextHop } = computeColorDistances(ws);
    ws.setDistanceMatrix(distances);
    ws.setNextHopMatrix(nextHop);
  }

  console.log(`Loaded ${wangSets.length} WangSet(s), ${metadataJson.tilesets.length} tileset(s)`);

  // 2. Load all maps
  const maps = await loadAllMaps();
  console.log(`Loaded ${maps.length} map(s)`);

  // 3. Load all prefabs
  const prefabs = await loadAllPrefabs();
  console.log(`Loaded ${prefabs.length} prefab(s)`);

  // 4. Resolve map tiles and collect unique sprites
  const tileRegistry = new TileRegistry();

  const resolvedMaps = maps.map(savedMap => {
    const ws = wangSets.find(w => w.name === savedMap.wangSetName);
    if (!ws) {
      console.warn(`WARNING: No WangSet "${savedMap.wangSetName}" for map "${savedMap.name}", skipping`);
      return null;
    }
    return resolveMap(savedMap, ws, prefabs, tileRegistry);
  }).filter((m): m is ResolvedMap => m !== null);

  // 5. Collect prefab tiles into registry (standalone, not stamped)
  const resolvedPrefabs = prefabs.map(p => resolvePrefab(p, tileRegistry));

  console.log(`Collected ${tileRegistry.size} unique tile(s)`);

  if (tileRegistry.size > 65535) {
    throw new Error(`Too many unique tiles (${tileRegistry.size}). Uint16Array max is 65535.`);
  }

  // 6. Build atlas PNG(s)
  const atlasInfo = await buildAtlas(tileRegistry, metadataJson.tilesets);

  // 7. Write output
  mkdirSync(join(OUTPUT_DIR, 'data', 'maps'), { recursive: true });
  mkdirSync(join(OUTPUT_DIR, 'data', 'prefabs'), { recursive: true });

  // Write atlas PNGs
  for (let i = 0; i < atlasInfo.buffers.length; i++) {
    const path = join(OUTPUT_DIR, `tileset-${i}.png`);
    writeFileSync(path, atlasInfo.buffers[i]);
    console.log(`Wrote ${path}`);
  }

  // Write map binary data
  for (const rm of resolvedMaps) {
    const binPath = join(OUTPUT_DIR, 'data', 'maps', `${rm.slug}.bin`);
    writeFileSync(binPath, rm.toBinary());
    console.log(`Wrote ${binPath}`);
  }

  // Write prefab binary data
  for (const rp of resolvedPrefabs) {
    const binPath = join(OUTPUT_DIR, 'data', 'prefabs', `${rp.slug}.bin`);
    writeFileSync(binPath, rp.toBinary());
    console.log(`Wrote ${binPath}`);
  }

  // Write index.ts
  const indexContent = generateIndex(resolvedMaps, resolvedPrefabs, atlasInfo);
  writeFileSync(join(OUTPUT_DIR, 'index.ts'), indexContent);
  console.log(`Wrote ${join(OUTPUT_DIR, 'index.ts')}`);

  console.log('Bake complete!');
}

// ============================================================
// Tile Registry — deduplicates tiles, assigns baked IDs
// ============================================================

interface TileEntry {
  bakedId: number;
  tilesetIndex: number;
  tileId: number;
  flipH: boolean;
  flipV: boolean;
  flipD: boolean;
}

class TileRegistry {
  private map = new Map<string, TileEntry>();
  private nextId = 1; // 0 reserved for empty

  /** Register a cell and return its baked ID. Returns 0 for empty cells. */
  register(cell: Cell): number {
    if (isCellEmpty(cell)) return 0;
    const key = cellSpriteKey(cell);
    let entry = this.map.get(key);
    if (!entry) {
      entry = {
        bakedId: this.nextId++,
        tilesetIndex: cell.tilesetIndex,
        tileId: cell.tileId,
        flipH: cell.flipH,
        flipV: cell.flipV,
        flipD: cell.flipD,
      };
      this.map.set(key, entry);
    }
    return entry.bakedId;
  }

  get size(): number { return this.map.size; }
  entries(): IterableIterator<TileEntry> { return this.map.values(); }
}

// ============================================================
// Map resolution
// ============================================================

interface ResolvedMap {
  slug: string;
  name: string;
  width: number;
  height: number;
  layerCount: number;
  layers: Uint16Array[];
  toBinary(): Buffer;
}

function resolveMap(
  savedMap: SavedMap,
  wangSet: WangSet,
  allPrefabs: SavedPrefab[],
  registry: TileRegistry
): ResolvedMap {
  const parsed = parseSavedMap({ ...savedMap, layers: savedMap.layers.map(l => [...l]) });
  const { width, height } = parsed;
  const slug = sanitizeSlug(savedMap.name);

  // Resolve each layer's colors to cells
  const resolvedLayers: Uint16Array[] = [];

  for (let li = 0; li < NUM_MAP_LAYERS; li++) {
    const colorLayer = parsed.layers[li];
    const hasContent = colorLayer.some(c => c !== 0);

    if (!hasContent) {
      resolvedLayers.push(new Uint16Array(width * height)); // all zeros
      continue;
    }

    // Create a map for this layer, resolve tiles
    const layerMap = new SimpleAutotileMap(width, height);
    layerMap.importColors(colorLayer);
    resolveAllTiles(layerMap, wangSet);

    // Convert resolved cells to baked IDs
    const bakedLayer = new Uint16Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        bakedLayer[y * width + x] = registry.register(layerMap.cellAt(x, y));
      }
    }
    resolvedLayers.push(bakedLayer);
  }

  // Stamp placed prefabs
  for (const pp of parsed.placedPrefabs ?? []) {
    const prefabData = allPrefabs.find(p => p.name === pp.prefabName);
    if (!prefabData) {
      console.warn(`WARNING: Prefab "${pp.prefabName}" not found, skipping placement on map "${savedMap.name}"`);
      continue;
    }
    const prefab = parseSavedPrefab({ ...prefabData, layers: prefabData.layers.map(l => [...l]) });
    stampPrefab(resolvedLayers, width, height, prefab, pp, registry);
  }

  return {
    slug,
    name: savedMap.name,
    width,
    height,
    layerCount: NUM_MAP_LAYERS,
    layers: resolvedLayers,
    toBinary() {
      const cellsPerLayer = width * height;
      const buf = Buffer.alloc(NUM_MAP_LAYERS * cellsPerLayer * 2);
      for (let li = 0; li < NUM_MAP_LAYERS; li++) {
        const offset = li * cellsPerLayer * 2;
        for (let i = 0; i < cellsPerLayer; i++) {
          buf.writeUInt16LE(resolvedLayers[li][i], offset + i * 2);
        }
      }
      return buf;
    },
  };
}

function stampPrefab(
  layers: Uint16Array[],
  mapWidth: number,
  mapHeight: number,
  prefab: SavedPrefab,
  placement: PlacedPrefab,
  registry: TileRegistry
): void {
  for (let pli = 0; pli < prefab.layers.length; pli++) {
    const mapLayer = placement.layer + pli;
    if (mapLayer >= NUM_MAP_LAYERS) break;

    for (const tile of prefab.layers[pli]) {
      const mx = placement.x + (tile.x - prefab.anchorX);
      const my = placement.y + (tile.y - prefab.anchorY);
      if (mx < 0 || mx >= mapWidth || my < 0 || my >= mapHeight) continue;

      const cell: Cell = {
        tileId: tile.tileId,
        tilesetIndex: tile.tilesetIndex,
        flipH: false, flipV: false, flipD: false,
      };
      layers[mapLayer][my * mapWidth + mx] = registry.register(cell);
    }
  }
}

// ============================================================
// Prefab resolution (standalone)
// ============================================================

interface ResolvedPrefab {
  slug: string;
  name: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  layerCount: number;
  layers: Uint16Array[];
  toBinary(): Buffer;
}

function resolvePrefab(savedPrefab: SavedPrefab, registry: TileRegistry): ResolvedPrefab {
  const prefab = parseSavedPrefab({ ...savedPrefab, layers: savedPrefab.layers.map(l => [...l]) });
  const slug = sanitizeSlug(prefab.name);

  // Compute bounding box across all layers
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const layer of prefab.layers) {
    for (const tile of layer) {
      minX = Math.min(minX, tile.x);
      minY = Math.min(minY, tile.y);
      maxX = Math.max(maxX, tile.x);
      maxY = Math.max(maxY, tile.y);
    }
  }

  // Handle empty prefabs
  if (minX === Infinity) {
    return {
      slug, name: prefab.name,
      width: 0, height: 0,
      anchorX: 0, anchorY: 0,
      layerCount: NUM_PREFAB_LAYERS,
      layers: Array.from({ length: NUM_PREFAB_LAYERS }, () => new Uint16Array(0)),
      toBinary() { return Buffer.alloc(0); },
    };
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const anchorX = prefab.anchorX - minX;
  const anchorY = prefab.anchorY - minY;

  const layers: Uint16Array[] = [];
  for (let pli = 0; pli < NUM_PREFAB_LAYERS; pli++) {
    const layer = new Uint16Array(width * height);
    for (const tile of prefab.layers[pli]) {
      const lx = tile.x - minX;
      const ly = tile.y - minY;
      const cell: Cell = {
        tileId: tile.tileId,
        tilesetIndex: tile.tilesetIndex,
        flipH: false, flipV: false, flipD: false,
      };
      layer[ly * width + lx] = registry.register(cell);
    }
    layers.push(layer);
  }

  return {
    slug, name: prefab.name, width, height, anchorX, anchorY,
    layerCount: NUM_PREFAB_LAYERS, layers,
    toBinary() {
      const cellsPerLayer = width * height;
      const buf = Buffer.alloc(NUM_PREFAB_LAYERS * cellsPerLayer * 2);
      for (let li = 0; li < NUM_PREFAB_LAYERS; li++) {
        const offset = li * cellsPerLayer * 2;
        for (let i = 0; i < cellsPerLayer; i++) {
          buf.writeUInt16LE(layers[li][i], offset + i * 2);
        }
      }
      return buf;
    },
  };
}

// ============================================================
// Atlas building
// ============================================================

interface AtlasInfo {
  buffers: Buffer[];
  columns: number;
  atlasSize: number;
  tileCount: number;
  tilesPerFile: number;
  fileCount: number;
}

async function buildAtlas(
  registry: TileRegistry,
  tilesetDefs: TilesetDef[]
): Promise<AtlasInfo> {
  const tileCount = registry.size;

  // Compute smallest power-of-2 atlas size
  const tilesNeeded = tileCount; // baked IDs start at 1, but we pack without gaps
  let atlasColumns = 1;
  while (atlasColumns * atlasColumns < tilesNeeded) atlasColumns *= 2;
  // atlasColumns is tiles per row; pixel size = atlasColumns * TILE_SIZE
  let atlasPixelSize = atlasColumns * TILE_SIZE;

  // Enforce power-of-2 pixel size
  let po2 = 1;
  while (po2 < atlasPixelSize) po2 *= 2;
  atlasPixelSize = po2;
  atlasColumns = atlasPixelSize / TILE_SIZE;

  const tilesPerFile = atlasColumns * atlasColumns;
  const fileCount = Math.ceil(tileCount / tilesPerFile);

  // Clamp individual atlas to MAX_ATLAS_SIZE
  if (atlasPixelSize > MAX_ATLAS_SIZE && fileCount === 1) {
    // Recalculate for splitting
    atlasPixelSize = MAX_ATLAS_SIZE;
    atlasColumns = MAX_ATLAS_SIZE / TILE_SIZE;
  }
  const finalTilesPerFile = (MAX_ATLAS_SIZE / TILE_SIZE) ** 2;
  const finalFileCount = Math.ceil(tileCount / finalTilesPerFile);

  // Use the smaller atlas size if everything fits
  const effectiveColumns = finalFileCount > 1 ? (MAX_ATLAS_SIZE / TILE_SIZE) : atlasColumns;
  const effectivePixelSize = effectiveColumns * TILE_SIZE;
  const effectiveTilesPerFile = effectiveColumns * effectiveColumns;
  const effectiveFileCount = Math.ceil(tileCount / effectiveTilesPerFile);

  console.log(`Atlas: ${effectivePixelSize}x${effectivePixelSize}px, ${effectiveColumns} cols, ${effectiveFileCount} file(s), ${tileCount} tiles`);

  // Load source tileset images
  const tilesetImages: sharp.Sharp[] = [];
  for (const def of tilesetDefs) {
    const imgPath = join(TILESETS_DIR, def.tilesetImage);
    tilesetImages.push(sharp(imgPath));
  }

  // Pre-extract raw buffers for each tileset
  const tilesetBuffers: { buf: Buffer; width: number; height: number; channels: number }[] = [];
  for (const img of tilesetImages) {
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    tilesetBuffers.push({ buf: data, width: info.width, height: info.height, channels: info.channels });
  }

  // Build atlas file(s)
  const atlasBuffers: Buffer[] = [];
  const entries = [...registry.entries()];

  for (let fi = 0; fi < effectiveFileCount; fi++) {
    const startIdx = fi * effectiveTilesPerFile;
    const endIdx = Math.min(startIdx + effectiveTilesPerFile, tileCount);
    const tilesInFile = endIdx - startIdx;

    // Determine this atlas file's actual size (smallest power-of-2 that fits)
    let fileColumns = 1;
    while (fileColumns * fileColumns < tilesInFile) fileColumns *= 2;
    let filePixelSize = fileColumns * TILE_SIZE;
    let p2 = 1;
    while (p2 < filePixelSize) p2 *= 2;
    filePixelSize = Math.min(p2, MAX_ATLAS_SIZE);
    fileColumns = filePixelSize / TILE_SIZE;

    // Create atlas buffer (RGBA)
    const atlasRgba = Buffer.alloc(filePixelSize * filePixelSize * 4);

    for (let i = startIdx; i < endIdx; i++) {
      const entry = entries[i];
      const localIdx = i - startIdx;
      const destCol = localIdx % fileColumns;
      const destRow = Math.floor(localIdx / fileColumns);

      // Extract 16x16 tile from source tileset
      const src = tilesetBuffers[entry.tilesetIndex];
      const srcColumns = Math.floor(src.width / TILE_SIZE);
      const srcCol = entry.tileId % srcColumns;
      const srcRow = Math.floor(entry.tileId / srcColumns);

      // Copy pixel by pixel with flip support
      for (let py = 0; py < TILE_SIZE; py++) {
        for (let px = 0; px < TILE_SIZE; px++) {
          // Apply flips to source coordinates
          let sx = px, sy = py;
          if (entry.flipD) [sx, sy] = [sy, sx];
          if (entry.flipH) sx = TILE_SIZE - 1 - sx;
          if (entry.flipV) sy = TILE_SIZE - 1 - sy;

          const srcX = srcCol * TILE_SIZE + sx;
          const srcY = srcRow * TILE_SIZE + sy;
          const srcOff = (srcY * src.width + srcX) * 4;

          const destX = destCol * TILE_SIZE + px;
          const destY = destRow * TILE_SIZE + py;
          const destOff = (destY * filePixelSize + destX) * 4;

          atlasRgba[destOff] = src.buf[srcOff];
          atlasRgba[destOff + 1] = src.buf[srcOff + 1];
          atlasRgba[destOff + 2] = src.buf[srcOff + 2];
          atlasRgba[destOff + 3] = src.buf[srcOff + 3];
        }
      }
    }

    const pngBuf = await sharp(atlasRgba, {
      raw: { width: filePixelSize, height: filePixelSize, channels: 4 },
    }).png().toBuffer();

    atlasBuffers.push(pngBuf);
  }

  return {
    buffers: atlasBuffers,
    columns: effectiveColumns,
    atlasSize: effectivePixelSize,
    tileCount,
    tilesPerFile: effectiveTilesPerFile,
    fileCount: effectiveFileCount,
  };
}

// ============================================================
// File loading
// ============================================================

async function loadAllMaps(): Promise<SavedMap[]> {
  const mapsDir = join(ASSETS_DIR, 'maps');
  if (!existsSync(mapsDir)) return [];
  const files = await Array.fromAsync(glob(join(mapsDir, '*.json')));
  return files.map(f => JSON.parse(readFileSync(f, 'utf-8')) as SavedMap);
}

async function loadAllPrefabs(): Promise<SavedPrefab[]> {
  const prefabsDir = join(ASSETS_DIR, 'prefabs');
  if (!existsSync(prefabsDir)) return [];
  const files = await Array.fromAsync(glob(join(prefabsDir, '*.json')));
  return files.map(f => JSON.parse(readFileSync(f, 'utf-8')) as SavedPrefab);
}

// ============================================================
// Output generation
// ============================================================

function generateIndex(
  maps: ResolvedMap[],
  prefabs: ResolvedPrefab[],
  atlas: AtlasInfo
): string {
  const lines: string[] = [
    '// Auto-generated by bake pipeline — do not edit',
    '',
    'export const atlas = {',
    '  version: 1,',
    `  tileWidth: ${TILE_SIZE},`,
    `  tileHeight: ${TILE_SIZE},`,
    `  files: [${Array.from({ length: atlas.fileCount }, (_, i) => `"tileset-${i}.png"`).join(', ')}],`,
    `  columns: ${atlas.columns},`,
    `  tileCount: ${atlas.tileCount},`,
    `  tilesPerFile: ${atlas.tilesPerFile},`,
    '};',
    '',
    'export interface BakedMap {',
    '  name: string;',
    '  width: number;',
    '  height: number;',
    '  tileWidth: number;',
    '  tileHeight: number;',
    '  layerCount: number;',
    '  layers: Uint16Array[];',
    '}',
    '',
    'export interface BakedPrefab {',
    '  name: string;',
    '  width: number;',
    '  height: number;',
    '  anchorX: number;',
    '  anchorY: number;',
    '  layerCount: number;',
    '  layers: Uint16Array[];',
    '}',
    '',
  ];

  // Map metadata
  lines.push('export const maps = {');
  for (const m of maps) {
    lines.push(`  ${m.slug}: { name: ${JSON.stringify(m.name)}, width: ${m.width}, height: ${m.height}, tileWidth: ${TILE_SIZE}, tileHeight: ${TILE_SIZE}, layerCount: ${m.layerCount}, dataFile: "data/maps/${m.slug}.bin" },`);
  }
  lines.push('} as const;', '');

  // Prefab metadata
  lines.push('export const prefabs = {');
  for (const p of prefabs) {
    lines.push(`  ${p.slug}: { name: ${JSON.stringify(p.name)}, width: ${p.width}, height: ${p.height}, anchorX: ${p.anchorX}, anchorY: ${p.anchorY}, layerCount: ${p.layerCount}, dataFile: "data/prefabs/${p.slug}.bin" },`);
  }
  lines.push('} as const;', '');

  // Loader functions
  lines.push(
    'type MapMeta = typeof maps[keyof typeof maps];',
    'type PrefabMeta = typeof prefabs[keyof typeof prefabs];',
    '',
    '/** Load a map\'s binary tile data. baseUrl is the path to the baked output directory. */',
    'export async function loadMap(meta: MapMeta, baseUrl: string): Promise<BakedMap> {',
    '  const buf = await fetch(`${baseUrl}/${meta.dataFile}`).then(r => r.arrayBuffer());',
    '  const cellsPerLayer = meta.width * meta.height;',
    '  const layers: Uint16Array[] = [];',
    '  for (let i = 0; i < meta.layerCount; i++) {',
    '    layers.push(new Uint16Array(buf, i * cellsPerLayer * 2, cellsPerLayer));',
    '  }',
    '  return { ...meta, layers };',
    '}',
    '',
    '/** Load a prefab\'s binary tile data. baseUrl is the path to the baked output directory. */',
    'export async function loadPrefab(meta: PrefabMeta, baseUrl: string): Promise<BakedPrefab> {',
    '  const buf = await fetch(`${baseUrl}/${meta.dataFile}`).then(r => r.arrayBuffer());',
    '  const cellsPerLayer = meta.width * meta.height;',
    '  const layers: Uint16Array[] = [];',
    '  for (let i = 0; i < meta.layerCount; i++) {',
    '    layers.push(new Uint16Array(buf, i * cellsPerLayer * 2, cellsPerLayer));',
    '  }',
    '  return { ...meta, layers };',
    '}',
    '',
  );

  return lines.join('\n');
}

// ============================================================
// Utilities
// ============================================================

/** Convert a display name to a valid JS identifier slug */
function sanitizeSlug(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (/^[0-9]/.test(slug)) slug = '_' + slug;
  // Avoid JS reserved words
  const reserved = new Set(['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
    'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for',
    'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null', 'return', 'super',
    'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield']);
  if (reserved.has(slug)) slug = '_' + slug;
  return slug;
}

// --- Run ---
main().catch(err => {
  console.error('Bake failed:', err);
  process.exit(1);
});
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit` (note: scripts/ may need adding to tsconfig include)

**Step 3: Commit**

```bash
git add scripts/bake.ts
git commit -m "feat(bake): add tile bake pipeline script"
```

---

### Task 3: Write unit tests for TileRegistry and sanitizeSlug

**Files:**
- Create: `tests/scripts/bake.test.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
```

Test the exported helper functions. Since `TileRegistry` and `sanitizeSlug` are currently in the bake script, we'll either need to extract them to a separate module or test them through the main script. Best approach: extract `TileRegistry`, `sanitizeSlug`, atlas sizing logic, and prefab bounding box logic into `scripts/bake-lib.ts`, keep `scripts/bake.ts` as the thin CLI entry point.

**Step 2: Extract testable logic to `scripts/bake-lib.ts`**

Move `TileRegistry`, `sanitizeSlug`, atlas size calculation, `resolvePrefab`, `resolveMap`, `stampPrefab`, and `generateIndex` into `scripts/bake-lib.ts`. Keep `main()` and CLI wiring in `scripts/bake.ts`.

**Step 3: Write tests for:**

1. **sanitizeSlug** — `"house front"` → `"house_front"`, `"2fast"` → `"_2fast"`, `"export"` → `"_export"`
2. **TileRegistry.register** — empty cell → 0, same cell twice → same ID, different cells → different IDs, sequential IDs from 1
3. **Atlas sizing** — 1 tile → 16x16 (1 col), 4 tiles → 32x32 (2 cols), 5 tiles → 64x64 (4 cols, next power-of-2), 16384 tiles → 2048x2048
4. **Prefab bounding box** — sparse tiles → correct width/height/rebased anchor
5. **Prefab stamping** — tiles placed at correct map positions with anchor offset, OOB tiles clipped

**Step 4: Run tests**

Run: `npx vitest run tests/scripts/`

**Step 5: Commit**

```bash
git add scripts/bake-lib.ts scripts/bake.ts tests/scripts/bake.test.ts
git commit -m "test(bake): add unit tests for bake pipeline helpers"
```

---

### Task 4: Write integration test

**Files:**
- Create: `tests/scripts/bake-integration.test.ts`

**Step 1: Write integration test**

Test that runs the full bake pipeline on actual project assets and verifies:

1. Output files exist: `tileset-0.png`, `data/maps/*.bin`, `data/prefabs/*.bin`, `index.ts`
2. Atlas PNG has correct dimensions (square, power-of-2, ≤2048)
3. Atlas PNG pixel dimensions match metadata
4. All tile IDs in binary data are within range [0, tileCount]
5. Binary file sizes match expected: `width * height * layerCount * 2` bytes
6. Index.ts contains valid TypeScript (basic syntax check)
7. Running bake twice produces identical output (determinism test)

**Step 2: Run integration test**

Run: `npx vitest run tests/scripts/bake-integration.test.ts`

**Step 3: Commit**

```bash
git add tests/scripts/bake-integration.test.ts
git commit -m "test(bake): add integration test for full bake pipeline"
```

---

### Task 5: Run full bake, verify output, update docs

**Step 1: Run the bake**

Run: `npm run bake`

Verify output in `dist/baked/`.

**Step 2: Run all tests**

Run: `npx tsc --noEmit && npx vitest run`

**Step 3: Update CHANGELOG.md**

Add a new section for the bake pipeline feature.

**Step 4: Update DATA_MODEL.md**

Add a section documenting the baked output format (atlas, binary, index.ts).

**Step 5: Commit**

```bash
git add docs/CHANGELOG.md docs/DATA_MODEL.md
git commit -m "docs: add bake pipeline to CHANGELOG and DATA_MODEL"
```
