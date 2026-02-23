/**
 * Bake pipeline library — testable logic extracted from the CLI entry point.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import type { ProjectMetadata, TilesetDef, TransformationConfig } from '../src/core/metadata-schema.js';
import { loadMetadata } from '../src/core/metadata-loader.js';
import { generateAllVariants } from '../src/core/variant-generator.js';
import { computeColorDistances } from '../src/core/color-distance.js';
import { SimpleAutotileMap } from '../src/core/autotile-map.js';
import { resolveAllTiles } from '../src/core/terrain-painter.js';
import { cellSpriteKey, isCellEmpty } from '../src/core/cell.js';
import type { Cell } from '../src/core/cell.js';
import type { SavedMap, PlacedPrefab } from '../src/core/map-schema.js';
import { parseSavedMap } from '../src/core/map-schema.js';
import type { SavedPrefab } from '../src/core/prefab-schema.js';
import { parseSavedPrefab } from '../src/core/prefab-schema.js';
import { NUM_MAP_LAYERS, NUM_PREFAB_LAYERS } from '../src/core/layers.js';
import type { WangSet } from '../src/core/wang-set.js';

export const TILE_SIZE = 16;
export const MAX_ATLAS_PX = 2048;

// ============================================================
// Tile Registry — deduplicates tiles, assigns baked IDs
// ============================================================

export interface TileEntry {
  bakedId: number;
  tilesetIndex: number;
  tileId: number;
  flipH: boolean;
  flipV: boolean;
  flipD: boolean;
  sourceWidth: number;
  sourceHeight: number;
}

export class TileRegistry {
  private map = new Map<string, TileEntry>();
  private nextId = 1; // 0 reserved for empty
  private tilesetDefs: TilesetDef[];

  constructor(tilesetDefs: TilesetDef[] = []) {
    this.tilesetDefs = tilesetDefs;
  }

  register(cell: Cell): number {
    if (isCellEmpty(cell)) return 0;
    const key = cellSpriteKey(cell);
    let entry = this.map.get(key);
    if (!entry) {
      const def = this.tilesetDefs[cell.tilesetIndex];
      entry = {
        bakedId: this.nextId++,
        tilesetIndex: cell.tilesetIndex,
        tileId: cell.tileId,
        flipH: cell.flipH,
        flipV: cell.flipV,
        flipD: cell.flipD,
        sourceWidth: def?.tileWidth ?? TILE_SIZE,
        sourceHeight: def?.tileHeight ?? TILE_SIZE,
      };
      this.map.set(key, entry);
    }
    return entry.bakedId;
  }

  isOversized(entry: TileEntry): boolean {
    return entry.sourceWidth > TILE_SIZE || entry.sourceHeight > TILE_SIZE;
  }

  normalEntries(): TileEntry[] {
    return this.entries().filter(e => !this.isOversized(e));
  }

  oversizedEntries(): TileEntry[] {
    return this.entries().filter(e => this.isOversized(e));
  }

  get size(): number { return this.map.size; }
  entries(): TileEntry[] { return [...this.map.values()]; }
}

// ============================================================
// Slug / identifier helpers
// ============================================================

const RESERVED_WORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'false',
  'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
  'let', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw',
  'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',
]);

export function sanitizeSlug(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!slug) slug = '_unnamed';
  if (/^[0-9]/.test(slug)) slug = '_' + slug;
  if (RESERVED_WORDS.has(slug)) slug = '_' + slug;
  return slug;
}

// ============================================================
// Atlas sizing
// ============================================================

export interface AtlasLayout {
  /** Pixels per side for each atlas file */
  pixelSize: number;
  /** Tiles per row in each atlas file */
  columns: number;
  /** Max tiles per file */
  tilesPerFile: number;
  /** Number of atlas files */
  fileCount: number;
}

/** Compute the smallest power-of-2 square atlas layout for N tiles. */
export function computeAtlasLayout(tileCount: number): AtlasLayout {
  if (tileCount === 0) {
    return { pixelSize: TILE_SIZE, columns: 1, tilesPerFile: 1, fileCount: 0 };
  }

  const maxCols = MAX_ATLAS_PX / TILE_SIZE; // 128
  const maxPerFile = maxCols * maxCols;      // 16384

  if (tileCount <= maxPerFile) {
    // Single file — find smallest power-of-2 columns that fits
    let cols = 1;
    while (cols * cols < tileCount) cols *= 2;
    return {
      pixelSize: cols * TILE_SIZE,
      columns: cols,
      tilesPerFile: cols * cols,
      fileCount: 1,
    };
  }

  // Multiple files at max size
  return {
    pixelSize: MAX_ATLAS_PX,
    columns: maxCols,
    tilesPerFile: maxPerFile,
    fileCount: Math.ceil(tileCount / maxPerFile),
  };
}

// ============================================================
// WangSet initialization
// ============================================================

export interface InitializedProject {
  wangSets: WangSet[];
  transformations: TransformationConfig;
  tilesetDefs: TilesetDef[];
}

export function initializeProject(metadataJson: ProjectMetadata): InitializedProject {
  const { wangSets, transformations } = loadMetadata(metadataJson);

  for (const ws of wangSets) {
    const variants = generateAllVariants(ws, transformations);
    ws.setVariants(variants);
    const { distances, nextHop } = computeColorDistances(ws);
    ws.setDistanceMatrix(distances);
    ws.setNextHopMatrix(nextHop);
  }

  return { wangSets, transformations, tilesetDefs: metadataJson.tilesets };
}

// ============================================================
// Map resolution
// ============================================================

export interface ResolvedMap {
  slug: string;
  name: string;
  width: number;
  height: number;
  layerCount: number;
  layers: Uint16Array[];
}

export function resolveMap(
  savedMap: SavedMap,
  wangSet: WangSet,
  allPrefabs: SavedPrefab[],
  registry: TileRegistry,
): ResolvedMap {
  const parsed = parseSavedMap({
    ...savedMap,
    layers: savedMap.layers.map(l => [...l]),
  });
  const { width, height } = parsed;
  const slug = sanitizeSlug(savedMap.name);

  const resolvedLayers: Uint16Array[] = [];

  for (let li = 0; li < NUM_MAP_LAYERS; li++) {
    const colorLayer = parsed.layers[li];
    const hasContent = colorLayer.some(c => c !== 0);

    if (!hasContent) {
      resolvedLayers.push(new Uint16Array(width * height));
      continue;
    }

    const layerMap = new SimpleAutotileMap(width, height);
    layerMap.importColors(colorLayer);
    resolveAllTiles(layerMap, wangSet);

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
      console.warn(`WARNING: Prefab "${pp.prefabName}" not found, skipping on map "${savedMap.name}"`);
      continue;
    }
    stampPrefab(resolvedLayers, width, height, prefabData, pp, registry);
  }

  return { slug, name: savedMap.name, width, height, layerCount: NUM_MAP_LAYERS, layers: resolvedLayers };
}

export function stampPrefab(
  layers: Uint16Array[],
  mapWidth: number,
  mapHeight: number,
  prefabData: SavedPrefab,
  placement: PlacedPrefab,
  registry: TileRegistry,
): void {
  const prefab = parseSavedPrefab({
    ...prefabData,
    layers: prefabData.layers.map(l => [...l]),
  });

  for (let pli = 0; pli < prefab.layers.length; pli++) {
    const mapLayer = placement.layer + pli;
    if (mapLayer >= layers.length) break;

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

export interface ResolvedPrefab {
  slug: string;
  name: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  layerCount: number;
  layers: Uint16Array[];
}

export function resolvePrefab(savedPrefab: SavedPrefab, registry: TileRegistry): ResolvedPrefab {
  const prefab = parseSavedPrefab({
    ...savedPrefab,
    layers: savedPrefab.layers.map(l => [...l]),
  });
  const slug = sanitizeSlug(prefab.name);

  // Bounding box across all layers
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const layer of prefab.layers) {
    for (const tile of layer) {
      minX = Math.min(minX, tile.x);
      minY = Math.min(minY, tile.y);
      maxX = Math.max(maxX, tile.x);
      maxY = Math.max(maxY, tile.y);
    }
  }

  if (minX === Infinity) {
    return {
      slug, name: prefab.name,
      width: 0, height: 0, anchorX: 0, anchorY: 0,
      layerCount: NUM_PREFAB_LAYERS,
      layers: Array.from({ length: NUM_PREFAB_LAYERS }, () => new Uint16Array(0)),
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

  return { slug, name: prefab.name, width, height, anchorX, anchorY, layerCount: NUM_PREFAB_LAYERS, layers };
}

// ============================================================
// Binary serialization
// ============================================================

export function mapToBinary(rm: ResolvedMap): Buffer {
  const cellsPerLayer = rm.width * rm.height;
  const buf = Buffer.alloc(rm.layerCount * cellsPerLayer * 2);
  for (let li = 0; li < rm.layerCount; li++) {
    const offset = li * cellsPerLayer * 2;
    for (let i = 0; i < cellsPerLayer; i++) {
      buf.writeUInt16LE(rm.layers[li][i], offset + i * 2);
    }
  }
  return buf;
}

export function prefabToBinary(rp: ResolvedPrefab): Buffer {
  const cellsPerLayer = rp.width * rp.height;
  if (cellsPerLayer === 0) return Buffer.alloc(0);
  const buf = Buffer.alloc(rp.layerCount * cellsPerLayer * 2);
  for (let li = 0; li < rp.layerCount; li++) {
    const offset = li * cellsPerLayer * 2;
    for (let i = 0; i < cellsPerLayer; i++) {
      buf.writeUInt16LE(rp.layers[li][i], offset + i * 2);
    }
  }
  return buf;
}

// ============================================================
// Atlas building
// ============================================================

export interface AtlasResult {
  buffers: Buffer[];
  layout: AtlasLayout;
}

export async function buildAtlas(
  registry: TileRegistry,
  tilesetDefs: TilesetDef[],
  tilesetsDir: string,
): Promise<AtlasResult> {
  const layout = computeAtlasLayout(registry.size);

  if (layout.fileCount === 0) {
    return { buffers: [], layout };
  }

  // Load source tileset raw buffers
  const tilesetBuffers: { buf: Buffer; width: number }[] = [];
  for (const def of tilesetDefs) {
    const imgPath = join(tilesetsDir, def.tilesetImage);
    const { data, info } = await sharp(imgPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    tilesetBuffers.push({ buf: data, width: info.width });
  }

  const entries = registry.entries();
  const atlasBuffers: Buffer[] = [];

  for (let fi = 0; fi < layout.fileCount; fi++) {
    const startIdx = fi * layout.tilesPerFile;
    const endIdx = Math.min(startIdx + layout.tilesPerFile, registry.size);
    const tilesInThisFile = endIdx - startIdx;

    // For the last file, use smallest power-of-2 that fits
    let fileCols = layout.columns;
    let filePx = layout.pixelSize;
    if (fi === layout.fileCount - 1 && layout.fileCount > 1) {
      fileCols = 1;
      while (fileCols * fileCols < tilesInThisFile) fileCols *= 2;
      filePx = Math.min(fileCols * TILE_SIZE, MAX_ATLAS_PX);
      fileCols = filePx / TILE_SIZE;
    }

    const atlasRgba = Buffer.alloc(filePx * filePx * 4);

    for (let i = startIdx; i < endIdx; i++) {
      const entry = entries[i];
      const localIdx = i - startIdx;
      const destCol = localIdx % fileCols;
      const destRow = Math.floor(localIdx / fileCols);

      const src = tilesetBuffers[entry.tilesetIndex];
      const srcCols = Math.floor(src.width / TILE_SIZE);
      const srcCol = entry.tileId % srcCols;
      const srcRow = Math.floor(entry.tileId / srcCols);

      for (let py = 0; py < TILE_SIZE; py++) {
        for (let px = 0; px < TILE_SIZE; px++) {
          let sx = px, sy = py;
          if (entry.flipD) [sx, sy] = [sy, sx];
          if (entry.flipH) sx = TILE_SIZE - 1 - sx;
          if (entry.flipV) sy = TILE_SIZE - 1 - sy;

          const srcX = srcCol * TILE_SIZE + sx;
          const srcY = srcRow * TILE_SIZE + sy;
          const srcOff = (srcY * src.width + srcX) * 4;

          const destX = destCol * TILE_SIZE + px;
          const destY = destRow * TILE_SIZE + py;
          const destOff = (destY * filePx + destX) * 4;

          atlasRgba[destOff] = src.buf[srcOff];
          atlasRgba[destOff + 1] = src.buf[srcOff + 1];
          atlasRgba[destOff + 2] = src.buf[srcOff + 2];
          atlasRgba[destOff + 3] = src.buf[srcOff + 3];
        }
      }
    }

    const pngBuf = await sharp(atlasRgba, {
      raw: { width: filePx, height: filePx, channels: 4 },
    }).png().toBuffer();

    atlasBuffers.push(pngBuf);
  }

  return { buffers: atlasBuffers, layout };
}

// ============================================================
// Index.ts generation
// ============================================================

export function generateIndex(
  maps: ResolvedMap[],
  prefabs: ResolvedPrefab[],
  layout: AtlasLayout,
  tileCount: number,
): string {
  const lines: string[] = [
    '// Auto-generated by bake pipeline — do not edit',
    '',
    'export const atlas = {',
    '  version: 1,',
    `  tileWidth: ${TILE_SIZE},`,
    `  tileHeight: ${TILE_SIZE},`,
    `  files: [${Array.from({ length: layout.fileCount }, (_, i) => `"tileset-${i}.png"`).join(', ')}],`,
    `  columns: ${layout.columns},`,
    `  tileCount: ${tileCount},`,
    `  tilesPerFile: ${layout.tilesPerFile},`,
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

  lines.push('export const maps = {');
  for (const m of maps) {
    lines.push(`  ${m.slug}: { name: ${JSON.stringify(m.name)}, width: ${m.width}, height: ${m.height}, tileWidth: ${TILE_SIZE}, tileHeight: ${TILE_SIZE}, layerCount: ${m.layerCount}, dataFile: "data/maps/${m.slug}.bin" },`);
  }
  lines.push('} as const;', '');

  lines.push('export const prefabs = {');
  for (const p of prefabs) {
    lines.push(`  ${p.slug}: { name: ${JSON.stringify(p.name)}, width: ${p.width}, height: ${p.height}, anchorX: ${p.anchorX}, anchorY: ${p.anchorY}, layerCount: ${p.layerCount}, dataFile: "data/prefabs/${p.slug}.bin" },`);
  }
  lines.push('} as const;', '');

  lines.push(
    'type MapMeta = typeof maps[keyof typeof maps];',
    'type PrefabMeta = typeof prefabs[keyof typeof prefabs];',
    '',
    '/** Load a map\'s binary tile data. baseUrl is the path to the baked output directory. */',
    'export async function loadMap(meta: MapMeta, baseUrl: string): Promise<BakedMap> {',
    '  const r = await fetch(`${baseUrl}/${meta.dataFile}`);',
    '  if (!r.ok) throw new Error(`Failed to load ${meta.dataFile}: ${r.status}`);',
    '  const buf = await r.arrayBuffer();',
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
    '  const r = await fetch(`${baseUrl}/${meta.dataFile}`);',
    '  if (!r.ok) throw new Error(`Failed to load ${meta.dataFile}: ${r.status}`);',
    '  const buf = await r.arrayBuffer();',
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
// README generation
// ============================================================

export function generateReadme(layout: AtlasLayout, tileCount: number): string {
  return `# Tileset Data Loading Guide (PixiJS / TypeScript)

## File Structure

\`\`\`
tileset-0.png          # Sprite atlas (${layout.pixelSize}x${layout.pixelSize}, ${TILE_SIZE}x${TILE_SIZE} tiles, ${layout.columns} columns)
index.ts               # Typed metadata, interfaces, and loader functions
data/maps/*.bin         # Binary tile data per map
data/prefabs/*.bin      # Binary tile data per prefab
\`\`\`

## Quick Start

\`\`\`typescript
import { atlas, maps, loadMap } from "./index.js";

// 1. Load the atlas as a PixiJS spritesheet
const atlasTexture = await PIXI.Assets.load("tileset-0.png");

// 2. Load a map
const map = await loadMap(maps.test, ".");

// 3. Render each layer (see detailed example below)
\`\`\`

## Atlas

The atlas PNG (\`tileset-0.png\`) is a ${layout.pixelSize}x${layout.pixelSize} spritesheet containing ${tileCount} unique ${TILE_SIZE}x${TILE_SIZE} tiles packed left-to-right, top-to-bottom.

\`\`\`
atlas.tileWidth    = ${TILE_SIZE}      // pixels per tile
atlas.tileHeight   = ${TILE_SIZE}
atlas.columns      = ${layout.columns}      // tiles per row in the atlas
atlas.tileCount    = ${tileCount}     // total unique tiles
atlas.tilesPerFile = ${layout.tilesPerFile}   // max capacity per atlas file
\`\`\`

**Baked tile ID 0 = empty (no tile).** IDs start at 1.

To get the source rectangle for a baked tile ID:

\`\`\`typescript
function getTileRect(bakedId: number) {
  const index = bakedId - 1; // IDs are 1-based
  const col = index % atlas.columns;
  const row = Math.floor(index / atlas.columns);
  return {
    x: col * atlas.tileWidth,
    y: row * atlas.tileHeight,
    width: atlas.tileWidth,
    height: atlas.tileHeight,
  };
}
\`\`\`

## Maps

Each map has 9 layers rendered bottom-to-top. All tile matching and prefab stamping is pre-resolved — every cell is a final baked tile ID ready to draw.

### Layer structure

| Layer | Purpose |
|-------|---------|
| 0     | Base terrain (ground) |
| 1     | Terrain overlay / decoration |
| 2     | Objects (trees, buildings base) |
| 3     | Objects upper (rooftops, canopy) |
| 4     | Top overlay |
| 5-8   | Overflow layers (used when prefabs are stacked on upper layers) |

Layers are rendered in order 0 through 8. Each layer is a flat row-major array of \`width * height\` Uint16 values. Most upper layers will be mostly zeros (empty).

### Map data format

\`\`\`typescript
interface BakedMap {
  name: string;       // display name
  width: number;      // grid width in tiles
  height: number;     // grid height in tiles
  tileWidth: number;  // ${TILE_SIZE}
  tileHeight: number; // ${TILE_SIZE}
  layerCount: number; // 9
  layers: Uint16Array[]; // 9 arrays, each width*height values
}
\`\`\`

Cell access: \`map.layers[layerIndex][y * map.width + x]\` returns the baked tile ID (0 = empty).

### Loading a map

\`\`\`typescript
import { maps, loadMap } from "./index.js";

// loadMap fetches the .bin file and parses it into typed Uint16Arrays
const map = await loadMap(maps.test, ".");
// map.layers[0][y * map.width + x] → baked tile ID
\`\`\`

### Full PixiJS rendering example

\`\`\`typescript
import * as PIXI from "pixi.js";
import { atlas, maps, loadMap } from "./index.js";

async function renderMap() {
  const app = new PIXI.Application();
  await app.init({ width: 800, height: 600 });

  // Load atlas texture
  const atlasTexture = await PIXI.Assets.load("tileset-0.png");
  const baseTexture = atlasTexture;

  // Pre-slice tile textures (skip ID 0 = empty)
  const tileTextures: PIXI.Texture[] = [PIXI.Texture.EMPTY]; // index 0 = empty
  for (let id = 1; id <= atlas.tileCount; id++) {
    const col = (id - 1) % atlas.columns;
    const row = Math.floor((id - 1) / atlas.columns);
    const frame = new PIXI.Rectangle(
      col * atlas.tileWidth,
      row * atlas.tileHeight,
      atlas.tileWidth,
      atlas.tileHeight,
    );
    tileTextures.push(new PIXI.Texture({ source: baseTexture.source, frame }));
  }

  // Load map
  const map = await loadMap(maps.test, ".");

  // Create a container per layer, rendered in order
  const mapContainer = new PIXI.Container();
  app.stage.addChild(mapContainer);

  for (let li = 0; li < map.layerCount; li++) {
    const layerContainer = new PIXI.Container();
    mapContainer.addChild(layerContainer);

    const layer = map.layers[li];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tileId = layer[y * map.width + x];
        if (tileId === 0) continue; // empty

        const sprite = new PIXI.Sprite(tileTextures[tileId]);
        sprite.x = x * atlas.tileWidth;
        sprite.y = y * atlas.tileHeight;
        layerContainer.addChild(sprite);
      }
    }
  }
}
\`\`\`

For large maps, consider using \`PIXI.TilingSprite\`, a \`CompositeTilemap\` from \`@pixi/tilemap\`, or rendering each layer to a \`PIXI.RenderTexture\` instead of creating individual sprites per tile.

## Prefabs

Prefabs are standalone reusable tile arrangements (buildings, objects). They are also pre-baked into maps at their placed positions, so you only need standalone prefabs if you want to place them dynamically at runtime.

\`\`\`typescript
interface BakedPrefab {
  name: string;
  width: number;      // bounding box width in tiles
  height: number;     // bounding box height in tiles
  anchorX: number;    // anchor tile X within bounding box
  anchorY: number;    // anchor tile Y within bounding box
  layerCount: number; // 5
  layers: Uint16Array[];
}
\`\`\`

Prefabs have 5 layers. When placing on a map, prefab layer 0 goes on the target map layer, layer 1 on the next map layer up, etc.

\`\`\`typescript
import { prefabs, loadPrefab } from "./index.js";

const prefab = await loadPrefab(prefabs.house_front, ".");
// Place at world position, offset by anchor
const worldX = targetTileX - prefab.anchorX;
const worldY = targetTileY - prefab.anchorY;
\`\`\`

## Key Facts

- **Tile size**: ${TILE_SIZE}x${TILE_SIZE} pixels
- **Tile ID 0**: Always empty (skip rendering)
- **Tile IDs are 1-based**: ID 1 is atlas position (0,0), ID 2 is (1,0), etc.
- **Row-major order**: \`layers[layer][y * width + x]\`
- **9 map layers**: Render bottom (0) to top (8) for correct z-ordering
- **5 prefab layers**: Stack onto consecutive map layers when placing
- **Pre-baked**: All autotile matching and flip transforms are pre-resolved. No runtime tile logic needed — just draw the tile for each ID.
`;
}

// ============================================================
// File loading helpers
// ============================================================

export async function loadAllJsonFiles<T>(dir: string): Promise<T[]> {
  if (!existsSync(dir)) return [];
  const { glob } = await import('node:fs/promises');
  const files = (await Array.fromAsync(glob(join(dir, '*.json')))).sort();
  return files.map(f => JSON.parse(readFileSync(f, 'utf-8')) as T);
}
