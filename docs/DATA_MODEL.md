# Data Model

How tilesets, maps, and prefabs are stored on disk and relate to each other. This document is intended for humans who need to give instructions to an AI agent working on this codebase.

## Terminology

### General

| Term | Meaning |
|------|---------|
| **Tileset** | A PNG spritesheet containing a grid of tile sprites. Defined by pixel dimensions, tile size, and column count. Multiple tilesets can coexist in one project. |
| **Tile ID** | Zero-based index of a tile within a tileset. `row * columns + col`. |
| **Tileset Index** | Zero-based index into the project's `tilesets[]` array. Identifies *which* tileset a tile comes from. |
| **WangSet** | A set of autotiling rules — defines terrain colors and which tiles represent transitions between them. Named (e.g. "grass"). |
| **Color** | A terrain type within a WangSet (e.g. "Grass", "Dirt"). Has a display hex color, a probability weight, and optionally a representative tile. Colors are 1-indexed. |
| **WangId** | An 8-element array encoding which colors touch each edge/corner of a tile. The core data that drives autotile matching. |
| **Variant** | A tile usable for autotile matching — either a base tile or a flipped/rotated copy of one. |
| **Cell** | A resolved tile placement: tile ID + tileset index + flip flags. What actually gets rendered. |
| **Prefab** | A reusable arrangement of specific tiles at grid positions. Concrete (stores exact tile IDs), unlike maps. |
| **Map** | A grid of terrain colors. Abstract (stores only color IDs); tiles are resolved at load time via the WangSet. |

### Tileset Editor (`/tools/tileset-editor/`)

Used to define WangSets, colors, and tag tiles with WangIds.

| Term | Meaning |
|------|---------|
| **Tag / Tagging** | Assigning a WangId to a tile — marking which terrain transitions it represents. |
| **Zone** | One of the 8 positions in a WangId (4 edges + 4 corners). The Inspector shows a 3x3 grid of clickable zones. |
| **Template** | A 4x4 grid showing all 16 possible corner patterns when mixing two colors. Used for rapid bulk-tagging of tiles. |
| **Completeness** | How many WangId combinations are defined vs. the total needed for seamless tiling. E.g. "12/16 complete" means 4 patterns are missing. |
| **Transformations** | Flip/rotate settings that let the engine generate additional tile variants from base tiles (e.g. a single corner tile can cover all 4 corners). |

### Map Painter (`/tools/map-painter/`)

Used to paint terrain on a grid and place prefabs. Tiles are auto-resolved by the WangSet.

| Term | Meaning |
|------|---------|
| **Brush** | Click/drag to paint the active color one tile at a time. Shortcut: **B**. |
| **Fill (Flood Fill)** | Click to fill all connected same-color tiles with the active color. Shortcut: **G**. |
| **Erase** | Paint with color 0 to clear tiles. Listed as the first color entry. Shortcut: **E**. |
| **Brush Size** | Size of the paint/erase brush: 1×1, 3×3, or 10×10. Cycle with **Z**. |
| **Active Color** | The currently selected terrain color. Shown in the sidebar Colors section. |
| **Autotiling** | The automatic process of picking the correct tile sprite based on neighboring terrain colors. Happens in real-time as you paint. |
| **Indirect Transition** | When two colors have no direct transition tile, the engine inserts intermediate colors (e.g. grass → dirt → sand). Powered by the distance/next-hop matrices. |
| **Layer** | Maps have 9 layers (5 editable via UI, 4 overflow for prefab placement). Layer 1 is the base terrain. |
| **Visibility Mode** | Controls how non-active layers render: **All** (full opacity), **Highlight** (active full, others 25%), **Solo** (only active layer visible). Shortcut: **V**. |
| **Pan** | Scroll or **WASD** keys to move the camera. Modifier keys (Cmd/Ctrl/Alt/Shift) suppress WASD to avoid conflicts with shortcuts. |
| **Zoom** | **Ctrl/Cmd + scroll** to zoom in/out (0.5×–6×). Current zoom level shown in the Map sidebar section. **Home** resets to default zoom and centers the camera. |
| **Map Resize** | Expand or shrink the map by 10 tiles in any cardinal direction (N/S/E/W) via the Map sidebar section. Minimum size 10×10. |
| **Prefab Placement** | Select a prefab from the sidebar, hover to preview, click to place. Prefab layers stack onto map layers starting from the active layer. |
| **Placed Prefab** | A reference to a prefab placed at a specific map position and layer. Stored in the saved map for tracking. |
| **Autosave** | Maps are saved automatically 5 seconds after any paint, fill, or prefab operation (only when the map has been named/saved once). |
| **Sidebar** | Collapsible left panel (240px) containing all controls: File, Tools, Layers, Colors, Prefabs, and Map. Toggle with **Tab**. |

### Prefab Editor (`/tools/prefab-editor/`)

Used to arrange specific tiles into reusable templates.

| Term | Meaning |
|------|---------|
| **Paint** | Place the selected tile(s) on the canvas. Default tool. Shortcut: **P**. |
| **Erase** | Remove tiles from the canvas. Shortcut: **E**. |
| **Move** | Drag-select tiles, then drag the selection to a new position. Shortcut: **M**. |
| **Copy** | Drag-select tiles to capture them as a stamp, then auto-switches to paint mode for stamping copies. Shortcut: **C**. |
| **Stamp** | A copied tile pattern ready to be pasted. Created by the Copy tool or by selecting multiple tiles from the tileset. |
| **Anchor** | The origin point (0,0) of a prefab. Defines where the prefab attaches when placed on a map. |
| **Canvas** | The editor grid. Auto-expands in steps of 10 cells as tiles are placed beyond its bounds. |
| **Autosave** | Prefabs are saved automatically 5 seconds after any change. Flushes immediately when switching prefabs. |

### Map Generator (`/tools/map-generator/`)

Used to procedurally generate terrain maps from biome configurations.

| Term | Meaning |
|------|---------|
| **Biome** | A terrain color selected for generation, with a weight controlling its relative area coverage. |
| **Noise** | Simplex noise-based algorithm producing organic, irregular biome regions. Multi-octave (3 octaves) for natural variation. |
| **Voronoi** | Voronoi diagram-based algorithm producing cleaner, polygon-shaped biome regions via nearest-neighbor assignment to scattered seed points. |
| **Scale** (noise) | Controls biome region size. Lower values = larger regions. Range 0.01–0.2, default 0.05. |
| **Point Count** (voronoi) | Number of seed points scattered across the map, distributed proportionally to biome weights. Range 5–100, default 30. |
| **Seed** | Numeric seed for reproducible generation. Same seed + settings = same map. Uses mulberry32 PRNG. |
| **Transitions** | After base generation, `insertIntermediates()` auto-inserts transition colors between non-adjacent biomes (e.g. Grass→Dirt→Sand). |

## File Layout

```
assets/
  TimeFantasy_TILES_6.24.17/TILESETS/   # Tileset PNG images (terrain.png, water.png, etc.)
  project.autotile.json                 # Project config: tileset list + WangSet definitions
  prefabs/
    <name>.json                         # One file per prefab
  maps/
    <name>.json                         # One file per saved map
```

## Project Metadata (`project.autotile.json`)

The central config file. Defines which tilesets exist and how their tiles relate to each other via WangSets.

```jsonc
{
  "version": 2,
  "tilesets": [
    {
      "tilesetImage": "terrain.png",    // Filename in the TILESETS directory
      "tileWidth": 16,                  // Pixel dimensions of one tile
      "tileHeight": 16,
      "columns": 39,                    // Tiles per row in the spritesheet
      "tileCount": 1482                 // Total tiles in the spritesheet
    }
    // ... more tilesets
  ],
  "transformations": {
    "allowRotate": false,               // Generate rotated tile variants
    "allowFlipH": false,                // Generate horizontally flipped variants
    "allowFlipV": false,                // Generate vertically flipped variants
    "preferUntransformed": true         // Prefer original tile over transformed variant
  },
  "wangsets": [/* see below */]
}
```

### Tile IDs

Tiles are identified by a zero-based integer index. Tile 0 is the top-left of the spritesheet. IDs increment left-to-right, top-to-bottom. To find a tile's pixel position:

```javascript
column = tileId % columns
row    = floor(tileId / columns)
pixelX = column * tileWidth
pixelY = row * tileHeight
```

### Tileset Index

When a tile reference needs to say *which* tileset it belongs to, it uses a `tilesetIndex` — the zero-based index into the `tilesets[]` array. For example, `tilesetIndex: 0` is `terrain.png`, `tilesetIndex: 1` is `water.png`, etc.

### WangSets

A WangSet defines a group of terrain colors and which tiles can be used for transitions between them. This is the core of the autotile system.

```jsonc
{
  "name": "grass",
  "type": "corner",           // "corner", "edge", or "mixed"
  "tile": -1,                 // Representative tile (display only)
  "colors": [
    {
      "name": "Grass",
      "color": "#4CAF50",     // Display color in the editor
      "probability": 1,       // Weight for random selection
      "tile": 468,            // Representative tile for this color
      "tileset": 0            // Which tileset the representative tile is from
    }
    // ... more colors (1-indexed when referenced in wangids)
  ],
  "wangtiles": [
    {
      "tileid": 468,
      "wangid": [1, 1, 1, 1, 1, 1, 1, 1],   // 8 color indices (see below)
      "probability": 1,                        // Tile selection weight (optional)
      "tileset": 0,                            // Which tileset this tile is from
      "animation": {                           // Optional animation data
        "frameDuration": 200,
        "pattern": "ping-pong",                // "loop" or "ping-pong"
        "frames": [
          { "tileId": 468, "tileset": 0 },
          { "tileId": 469, "tileset": 0 }
        ]
      }
    }
    // ... more wangtiles
  ]
}
```

### WangId (the 8-element array)

Each tagged tile has a `wangid` — an array of 8 color indices describing what terrain occupies each position around the tile. The indices go clockwise starting from the **top edge**:

```
[7]  [0]  [1]
[6]  tile [2]
[5]  [4]  [3]
```

- Index 0: top edge
- Index 1: top-right corner
- Index 2: right edge
- Index 3: bottom-right corner
- Index 4: bottom edge
- Index 5: bottom-left corner
- Index 6: left edge
- Index 7: top-left corner

Even indices (0, 2, 4, 6) are **edges**. Odd indices (1, 3, 5, 7) are **corners**.

Values are 1-indexed color IDs (matching position in the `colors[]` array + 1). A value of 0 means "any/unspecified" for that position.

For `type: "corner"`, only odd indices (1, 3, 5, 7) are used. For `type: "edge"`, only even indices (0, 2, 4, 6). For `type: "mixed"`, all 8.

## Saved Maps (`assets/maps/<name>.json`)

Maps store **only terrain colors**, not tile IDs. When a map is loaded, the autotile engine recomputes which specific tiles to use based on the current WangSet definitions. This means saved maps automatically pick up tileset changes.

Maps have 9 layers. Layers 0-4 are user-editable (shown as layers 1-5 in the UI). Layers 5-8 are overflow layers used when a 5-layer prefab is placed on map layer 5.

```jsonc
{
  "version": 2,
  "name": "test1",
  "wangSetName": "grass",       // Which WangSet to use for tile resolution
  "width": 64,                  // Grid dimensions (default 64, resizable in increments of 10)
  "height": 64,
  "layers": [                   // 9 arrays, each flat row-major (length = width * height)
    [1, 1, 1, 2, ...],         // Layer 0 (base terrain)
    [0, 0, 0, 0, ...],         // Layer 1
    // ... up to 9 layers total
  ],
  "placedPrefabs": [            // Optional — tracks which prefabs were placed on the map
    {
      "prefabName": "tree",     // Name of the prefab (matches prefab filename)
      "x": 5,                   // Anchor cell X on map
      "y": 3,                   // Anchor cell Y on map
      "layer": 0                // Base map layer (0-indexed) the prefab was placed on
    }
  ]
}
```

Color values are 1-indexed WangSet color IDs. 0 means empty. Each layer array reads left-to-right, top-to-bottom:

```javascript
layer[0]       = cell (0, 0) // top-left
layer[width-1] = cell (width-1, 0) // top-right
layer[width]   = cell (0, 1) // second row, first column
```

Maps are loaded via URL hash: `/tools/map-painter/#map=test1` loads `assets/maps/test1.json`. Layer can be specified: `#map=test1&layer=2`.

## Saved Prefabs (`assets/prefabs/<name>.json`)

Prefabs are reusable tile arrangements — a collection of specific tiles placed at grid positions across 5 layers. Unlike maps, prefabs store **exact tile IDs** (not terrain colors), so they reference specific sprites.

```jsonc
{
  "version": 2,
  "name": "house front",
  "layers": [                  // 5 layer arrays
    [                          // Layer 0
      {
        "x": 6,               // Grid position within the prefab canvas
        "y": 4,
        "tileId": 661,        // Specific tile from the spritesheet
        "tilesetIndex": 5     // Which tileset (index into project tilesets[])
      }
      // ... more tiles
    ],
    [],                        // Layer 1 (empty)
    // ... up to 5 layers total
  ],
  "anchorX": 0,               // Anchor point for placement origin
  "anchorY": 0
}
```

Prefabs can contain tiles from multiple tilesets (each tile has its own `tilesetIndex`). The anchor point defines the origin when placing the prefab on a map.

When a prefab is placed on a map, its layers stack onto consecutive map layers starting from the active layer. For example, placing a prefab on map layer 2 puts prefab layer 0 on map layer 2, prefab layer 1 on map layer 3, etc.

## How They Connect

```text
project.autotile.json
  ├── tilesets[]        ← tileset PNGs in the TILESETS directory
  │     indexes used by:  maps (indirectly via WangSets), prefabs (tilesetIndex)
  ├── wangsets[]        ← terrain rules
  │     used by:          maps (wangSetName references a wangset)
  └── transformations   ← variant generation config

maps/<name>.json
  ├── layers[]          ← 9 layers of terrain color IDs (resolved to tiles at load time)
  └── placedPrefabs[]   ← references to prefabs placed on the map
        └── prefabName  → prefabs/<name>.json (looked up at load time)

prefabs/<name>.json
  └── layers[]          ← 5 layers of exact tileId + tilesetIndex (no autotile resolution)
```

Key difference: **Maps are abstract** (colors only, tiles resolved dynamically) while **prefabs are concrete** (exact tile references). When a prefab is placed on a map, its tiles are stamped directly onto the map's tile layers, and a `PlacedPrefab` reference is stored so the placement can be tracked and undone.

---

## Runtime Data Structures

These are the in-memory representations used by the autotile engine. They are built from the JSON files at startup and live only in memory.

### Cell

A single placed tile on the map. This is what the autotile engine resolves each grid position to.

```typescript
Cell {
  tileId: number          // Which tile from the spritesheet (-1 = empty)
  tilesetIndex: number    // Which tileset
  flipH: boolean          // Horizontally flipped
  flipV: boolean          // Vertically flipped
  flipD: boolean          // Diagonally flipped (transpose, used for rotation)
}
```

The flip flags allow a single tile to serve multiple terrain transitions. For example, a grass-to-dirt corner tile can be flipped to cover all four corners. The combination of `flipH`, `flipV`, and `flipD` can represent any 90-degree rotation plus mirroring.

### AutotileMap / SimpleAutotileMap

The map grid. Holds two parallel flat arrays (row-major):

```typescript
SimpleAutotileMap {
  width, height: number
  colors: number[]        // What the user painted (terrain color IDs)
  cells: Cell[]           // What the engine resolved (specific tiles + flip flags)
}
```

- `colors[y * width + x]` = the terrain color at grid position (x, y)
- `cells[y * width + x]` = the resolved Cell at grid position (x, y)

When the user paints a color, the engine updates `colors[]`, then runs the matching algorithm to update `cells[]` for the affected tiles and their neighbors.

### WangId

An 8-element number array describing what terrain colors surround a tile. See [WangId (the 8-element array)](#wangid-the-8-element-array) above for the index layout.

```typescript
WangId {
  colors: number[8]      // Color IDs at each position around the tile
}
```

### WangSet

The central runtime structure for autotiling. Built from the JSON wangset data plus precomputed caches.

```typescript
WangSet {
  name: string
  type: 'corner' | 'edge' | 'mixed'
  colors: WangColor[]

  // Core data
  tileMapping: Map<"tilesetIndex:tileId", WangId>     // Base tile → WangId
  tileProbabilities: Map<"tilesetIndex:tileId", number> // Per-tile weight

  // Precomputed at load time
  variants: WangVariant[]           // All tile variants (base + rotated/flipped)
  cellWangIds: Map<spriteKey, WangId> // Reverse lookup: cell → WangId
  distanceMatrix: number[][]        // Color-to-color shortest distances (Floyd-Warshall)
  nextHopMatrix: number[][]         // First intermediate color on shortest path
}
```

**`tileMapping`** maps each tagged tile to its WangId. Keys are `"tilesetIndex:tileId"` strings.

**`variants`** is the expanded set of all usable tiles. If transformations are enabled, this includes rotated/flipped versions of base tiles. Each variant is a `{ wangId: WangId, cell: Cell }` pair.

**`distanceMatrix`** and **`nextHopMatrix`** power indirect transitions. When painting color A next to color B with no direct transition tile, the engine uses `nextHopMatrix[A][B]` to find intermediate colors to insert (e.g., grass → dirt → sand instead of grass → sand directly).

### WangColor

A terrain type within a WangSet.

```typescript
WangColor {
  id: number              // 1-based (0 = wildcard/unspecified)
  name: string            // Display name ("Grass", "Dirt", etc.)
  color: string           // Hex color for editor overlays
  probability: number     // Weight for random selection (default 1.0)
  imageTileId: number     // Representative tile for UI thumbnails
  tilesetIndex: number    // Which tileset the representative tile is from
}
```

### WangVariant

A single usable tile in the matching system. May be a base tile or a transformed (rotated/flipped) copy.

```typescript
WangVariant {
  wangId: WangId          // What terrain configuration this tile represents
  cell: Cell              // The tile + flip flags to render it
}
```

### How Matching Works (runtime flow)

When the user paints color C at position (x, y):

1. **Set color**: `map.setColorAt(x, y, C)`
2. **Build desired WangId**: For each affected cell, read the 8 neighbor colors from the map to build the desired WangId
3. **Skip if matching**: If the existing cell already satisfies the desired WangId, keep it (avoids unnecessary tile churn)
4. **Find best match**: Search `wangSet.variants` for the variant whose WangId best matches the desired one, weighted by tile and color probabilities
5. **Set cell**: `map.setCellAt(x, y, bestMatch.cell)`
6. **Render**: The engine reads the Cell's `tileId`, `tilesetIndex`, and flip flags to draw the correct sprite

---

## Baked Output (`dist/baked/`)

The bake pipeline (`npm run bake`) resolves all maps and prefabs at build time and outputs a compact, engine-agnostic format. No autotile engine needed at runtime — consumers just draw tiles from the atlas.

### Output files

```text
dist/baked/
  tileset-0.png              # Atlas PNG (square, power-of-2, max 2048px)
  tileset-1.png              # Additional atlas if tiles exceed 16384
  data/maps/<slug>.bin        # Binary tile data per map
  data/prefabs/<slug>.bin     # Binary tile data per prefab
  index.ts                    # Typed metadata + loader functions
```

### Atlas PNG

All unique tiles used across maps and prefabs are packed into a single spritesheet. Each unique `(tilesetIndex, tileId, flipH, flipV, flipD)` combination is a separate tile in the atlas — flips are pre-rendered so consumers don't need transform logic.

- **Tile size**: 16x16 pixels
- **Layout**: Left-to-right, top-to-bottom. Baked ID 1 is at position (0,0), ID 2 at (1,0), etc.
- **Atlas sizing**: Smallest square power-of-2 that fits all tiles. If > 2048px, splits into `tileset-0.png`, `tileset-1.png`, etc.
- **Baked ID 0** = empty (no tile). IDs start at 1.
- **Consumer formula**: `atlasCol = (bakedId - 1) % columns`, `atlasRow = floor((bakedId - 1) / columns)`
- **Oversized tiles**: Tiles larger than 16×16 (e.g., 60×64 monster sprites) are packed in aligned blocks after normal tiles. A 60×64 tile occupies a 4×4 block (64×64 pixels). Their positions are listed in `atlas.oversizeTiles` rather than derived from baked ID.
- **Render offsets**: Oversized tiles are bottom-center anchored to their 16×16 grid cell. `renderOffsetX` centers horizontally, `renderOffsetY` aligns the bottom edge. For 60×64: offsetX=-22, offsetY=-48.

### Binary map data (`.bin`)

Raw little-endian Uint16 values. Layers are concatenated sequentially:

```text
[layer0: width*height Uint16 values][layer1: width*height Uint16 values]...[layer8]
```

Total size: `width * height * 9 * 2` bytes (9 layers per map). Each value is a baked tile ID (0 = empty).

### Binary prefab data (`.bin`)

Same format as maps but with 5 layers and the prefab's bounding-box dimensions:

```text
[layer0: width*height Uint16 values]...[layer4]
```

Total size: `width * height * 5 * 2` bytes. Prefab coordinates are rebased to (0,0) origin. The anchor is adjusted: `bakedAnchorX = originalAnchorX - minX`.

### index.ts

Generated TypeScript module with:

- `atlas` — metadata: version, tileWidth, tileHeight, files[], columns, tileCount, tilesPerFile, oversizeTiles (map of bakedId → atlas position + source rect + render offsets)
- `BakedMap` / `BakedPrefab` — interfaces for loaded data
- `maps` — metadata for each map (name, dimensions, layerCount, dataFile path)
- `prefabs` — metadata for each prefab (name, dimensions, anchor, layerCount, dataFile path)
- `loadMap(meta, baseUrl)` — fetch + parse binary into typed `BakedMap`
- `loadPrefab(meta, baseUrl)` — fetch + parse binary into typed `BakedPrefab`

Maps with placed prefabs have prefab tiles stamped directly into the map layers. Prefabs are also exported standalone for reuse.

### Determinism

Output is fully deterministic (seeded PRNG). Running `npm run bake` twice on the same input produces identical output.
