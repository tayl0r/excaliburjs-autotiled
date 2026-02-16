# Autotile Engine Spec

> Core data model, algorithms, and runtime integration for Wang tile autotiling.
> Derived from the Tiled map editor source code (mapeditor.org).
>
> Related documents:
> - [Tile Metadata Editor Spec](./TILE_METADATA_EDITOR_SPEC.md) — standalone tool for tagging tiles
> - [JSON Schema](./AUTOTILE_JSON_SCHEMA.md) — the metadata format both tools share
> - [TimeFantasy Asset Guide](./TIMEFANTASY_ASSET_GUIDE.md) — applying this to the TimeFantasy assets

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Core Data Model](#2-core-data-model)
3. [WangId Encoding — The Heart of Autotiling](#3-wangid-encoding)
4. [Per-Tile Metadata Schema](#4-per-tile-metadata-schema)
5. [The Matching Algorithm](#5-the-matching-algorithm)
6. [Tile Transformation System](#6-tile-transformation-system)
7. [Transition Penalty (Color Distance) System](#7-transition-penalty-system)
8. [Weighted Random Tile Selection](#8-weighted-random-tile-selection)
9. [Runtime Engine Integration](#9-runtime-engine-integration)
10. [Reference: Tile Count Math](#10-reference-tile-count-math)
11. [Implementation Checklist](#11-implementation-checklist)

---

## 1. System Overview

Autotiling automatically selects the correct tile image when painting terrain. Instead of manually placing each grass-to-dirt transition tile, the artist paints "grass" and "dirt" and the engine picks the right transition.

The system used by Tiled is based on **Wang tiles** — a mathematical tiling system where each tile has colored edges/corners, and adjacent tiles must have matching colors on shared boundaries.

### Architecture Layers

There are **two separate tools** plus the runtime engine:

```
ASSET PIPELINE (offline, before any maps exist)
+---------------------------------------------------+
|  Tile Metadata Editor                             |  <-- TILE_METADATA_EDITOR_SPEC.md
|  (load spritesheets, tag tiles, create            |
|   WangSets, assign WangIds, validate)             |
+---------------------------------------------------+
|  Metadata Store  (JSON: tileset -> wang sets)     |  <-- AUTOTILE_JSON_SCHEMA.md
+---------------------------------------------------+
            |  produces .json metadata files
            v
AUTHORING / RUNTIME (uses tagged metadata)
+---------------------------------------------------+
|  Map Editor  (paint terrain using WangSets)       |  <-- Consumes metadata
+---------------------------------------------------+
|  WangFiller  (matching algorithm)                 |  <-- THIS DOCUMENT (Sections 5-8)
+---------------------------------------------------+
|  Tile Renderer  (draws selected tiles)            |  <-- Your existing engine
+---------------------------------------------------+
```

The Tile Metadata Editor is an **asset pipeline tool** — it runs separately, operates on raw spritesheet PNGs, and produces the JSON metadata that everything else depends on. You cannot do autotiling without first tagging your tiles.

---

## 2. Core Data Model

You need these data structures. All of them.

### 2.1 WangColor (a terrain type)

```
WangColor:
    id: int              # 1-based index (0 = empty/wildcard)
    name: string         # e.g. "Grass", "Dirt", "Water"
    color: RGBA          # Editor-only display color for overlays
    imageTileId: int     # Representative tile ID for UI thumbnails
    probability: float   # Default 1.0; weight for random selection
```

### 2.2 WangSet (a group of terrain rules for one tileset)

```
WangSet:
    name: string                    # e.g. "Outdoor Terrain"
    type: enum {Corner, Edge, Mixed}
    colors: WangColor[]             # The terrain types in this set
    tileMapping: Map<int, WangId>   # tileId -> WangId (the core data)
    imageTileId: int                # Representative tile for UI
```

**Type determines which indices matter:**
- `Corner`: Only the 4 corner positions (indices 1, 3, 5, 7)
- `Edge`: Only the 4 edge positions (indices 0, 2, 4, 6)
- `Mixed`: All 8 positions

**For TimeFantasy tiles, use `Corner` type.** RPG-style tilesets with 16x16 tiles almost always use corner-based terrain. Edge-based is for larger tiles or hex grids.

### 2.3 Cell (a placed tile on the map)

```
Cell:
    tilesetId: int       # Which tileset
    tileId: int          # Which tile within the tileset
    flipH: bool          # Flipped horizontally
    flipV: bool          # Flipped vertically
    flipD: bool          # Flipped anti-diagonally (diagonal flip = 90 degree rotation)
```

The three flip flags encode all 8 possible orientations (4 rotations x 2 mirrors):

| flipH | flipV | flipD | Result           |
|-------|-------|-------|------------------|
| 0     | 0     | 0     | Original         |
| 1     | 0     | 0     | Mirror H         |
| 0     | 1     | 0     | Mirror V         |
| 1     | 1     | 0     | Rotate 180       |
| 0     | 0     | 1     | Rotate 90 CW + Mirror H |
| 1     | 0     | 1     | Rotate 90 CW    |
| 0     | 1     | 1     | Rotate 270 CW   |
| 1     | 1     | 1     | Rotate 90 CW + Mirror V |

---

## 3. WangId Encoding

This is the most important data structure. Each tile that participates in autotiling gets one WangId.

### 3.1 Layout

A WangId is a **64-bit integer** encoding **8 color indices** (one per edge and corner), each using **8 bits**.

```
Position layout around a tile:

    7 | 0 | 1
    --+---+--
    6 | X | 2
    --+---+--
    5 | 4 | 3

Index  Name          Type
-----  ----          ----
  0    Top           Edge
  1    TopRight      Corner
  2    Right         Edge
  3    BottomRight   Corner
  4    Bottom        Edge
  5    BottomLeft    Corner
  6    Left          Edge
  7    TopLeft       Corner
```

### 3.2 Bit Packing

```
Bits [7:0]   = Top edge color        (index 0)
Bits [15:8]  = TopRight corner color  (index 1)
Bits [23:16] = Right edge color       (index 2)
Bits [31:24] = BottomRight corner     (index 3)
Bits [39:32] = Bottom edge color      (index 4)
Bits [47:40] = BottomLeft corner      (index 5)
Bits [55:48] = Left edge color        (index 6)
Bits [63:56] = TopLeft corner         (index 7)
```

### 3.3 Color Values

- `0` = **Wildcard** (matches anything — "don't care")
- `1..254` = Valid terrain color indices (1-based, matching WangColor.id)
- Color 0 is never stored as a terrain; it means "no constraint"

### 3.4 Type Masks

When the WangSet type is `Corner`, only indices 1, 3, 5, 7 matter. Apply this mask:

```
CornerMask = 0xFF00FF00FF00FF00
EdgeMask   = 0x00FF00FF00FF00FF
MixedMask  = 0xFFFFFFFFFFFFFFFF
```

### 3.5 Implementation

```python
class WangId:
    BITS_PER_INDEX = 8
    INDEX_MASK = 0xFF
    NUM_INDEXES = 8

    def __init__(self, value=0):
        self.value = value  # uint64

    def index_color(self, index):
        """Get the color at position 0-7."""
        return (self.value >> (index * self.BITS_PER_INDEX)) & self.INDEX_MASK

    def set_index_color(self, index, color):
        """Set the color at position 0-7."""
        shift = index * self.BITS_PER_INDEX
        self.value = (self.value & ~(self.INDEX_MASK << shift)) | (color << shift)

    def edge_color(self, edge_index):
        """Get edge color. 0=Top, 1=Right, 2=Bottom, 3=Left."""
        return self.index_color(edge_index * 2)

    def corner_color(self, corner_index):
        """Get corner color. 0=TopRight, 1=BottomRight, 2=BottomLeft, 3=TopLeft."""
        return self.index_color(corner_index * 2 + 1)

    def rotated(self, rotations):
        """Rotate CW by rotations * 90 degrees."""
        result = WangId(self.value)
        for _ in range(rotations % 4):
            old = result.value
            new_val = 0
            for i in range(self.NUM_INDEXES):
                color = (old >> (i * self.BITS_PER_INDEX)) & self.INDEX_MASK
                new_index = (i + 2) % self.NUM_INDEXES  # +2 = 90 CW
                new_val |= color << (new_index * self.BITS_PER_INDEX)
            result.value = new_val
        return result

    def flipped_horizontally(self):
        """Flip left-right."""
        result = WangId()
        # Swap: Top<->Top, TopRight<->TopLeft, Right<->Left, BottomRight<->BottomLeft, Bottom<->Bottom
        swap_map = {0: 0, 1: 7, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1}
        for src, dst in swap_map.items():
            result.set_index_color(dst, self.index_color(src))
        return result

    def flipped_vertically(self):
        """Flip top-bottom."""
        result = WangId()
        swap_map = {0: 4, 1: 3, 2: 2, 3: 1, 4: 0, 5: 7, 6: 6, 7: 5}
        for src, dst in swap_map.items():
            result.set_index_color(dst, self.index_color(src))
        return result

    def matches(self, other, mask):
        """Check if this WangId matches other under the given mask."""
        return (self.value & mask) == (other.value & mask)

    def has_wildcards(self):
        """Check if any index is 0 (wildcard)."""
        for i in range(self.NUM_INDEXES):
            if self.index_color(i) == 0:
                return True
        return False

    @staticmethod
    def opposite_index(index):
        """Index on the opposite side (for neighbor matching)."""
        return (index + 4) % 8

    def to_array(self):
        """Serialize to [top, topRight, right, bottomRight, bottom, bottomLeft, left, topLeft]."""
        return [self.index_color(i) for i in range(8)]

    @staticmethod
    def from_array(arr):
        """Deserialize from 8-element array."""
        w = WangId()
        for i, color in enumerate(arr):
            w.set_index_color(i, color)
        return w
```

---

## 4. Per-Tile Metadata Schema

Every tile that participates in autotiling needs this metadata:

```
TileAutotileData:
    tileId: int              # Position in the tileset grid (0-based, left-to-right, top-to-bottom)
    wangId: int[8]           # The 8 color indices [top, topRight, right, bottomRight, bottom, bottomLeft, left, topLeft]
    probability: float       # Weight for random selection (default 1.0)
```

### Example: A Corner-Type Grass/Dirt Set

For corner type, only indices 1, 3, 5, 7 matter. Edges (0, 2, 4, 6) are set to 0.

Let Grass = color 1, Dirt = color 2.

```
Full grass tile:       wangId = [0, 1, 0, 1, 0, 1, 0, 1]
Full dirt tile:        wangId = [0, 2, 0, 2, 0, 2, 0, 2]
Grass->Dirt top-right: wangId = [0, 2, 0, 1, 0, 1, 0, 1]  (TopRight is dirt, rest grass)
```

### The 16-Tile Corner Template

For a 2-color corner-type Wang set, there are exactly **2^4 = 16** unique corner combinations:

```
Tile  TL  TR  BR  BL   Visual Description
----  --  --  --  --   ------------------
  0    A   A   A   A   Full terrain A (e.g., all grass)
  1    B   A   A   A   Top-left corner of B
  2    A   B   A   A   Top-right corner of B
  3    B   B   A   A   Top edge of B
  4    A   A   B   A   Bottom-right corner of B
  5    B   A   B   A   Diagonal: TL + BR corners
  6    A   B   B   A   Right edge of B
  7    B   B   B   A   B with bottom-left cutout
  8    A   A   A   B   Bottom-left corner of B
  9    B   A   A   B   Left edge of B
 10    A   B   A   B   Diagonal: TR + BL corners
 11    B   B   A   B   B with bottom-right cutout
 12    A   A   B   B   Bottom edge of B
 13    B   A   B   B   B with top-right cutout
 14    A   B   B   B   B with top-left cutout
 15    B   B   B   B   Full terrain B (e.g., all dirt)
```

This is the **minimum complete set** for 2-color corner autotiling.

---

## 5. The Matching Algorithm

This is the runtime algorithm that selects which tile to place at a given position.

### 5.1 Overview

```
Input:  A map position (x, y) where we want to place/update a tile
Output: A Cell (tileId + flip flags) to place there

Steps:
1. Determine the DESIRED WangId from neighbors and user intent
2. Search all available tiles for the BEST MATCH
3. Return the match (or flag as invalid if none found)
```

### 5.2 Step 1: Build Desired WangId from Surroundings

For each of the 8 neighbor positions, read what color is expected on the shared boundary.

```python
def wang_id_from_surroundings(map, x, y, wang_set):
    """
    Build a WangId describing what we NEED at position (x, y)
    based on what's already placed around it.
    """
    desired = WangId()

    # For each of the 8 directions
    neighbors = [
        (0, -1, 0),   # Top edge        -> index 0
        (1, -1, 1),   # TopRight corner  -> index 1
        (1,  0, 2),   # Right edge       -> index 2
        (1,  1, 3),   # BottomRight      -> index 3
        (0,  1, 4),   # Bottom edge      -> index 4
        (-1, 1, 5),   # BottomLeft       -> index 5
        (-1, 0, 6),   # Left edge        -> index 6
        (-1,-1, 7),   # TopLeft          -> index 7
    ]

    for dx, dy, index in neighbors:
        nx, ny = x + dx, y + dy
        neighbor_cell = map.cell_at(nx, ny)

        if neighbor_cell.is_empty():
            desired.set_index_color(index, 0)  # Wildcard
            continue

        neighbor_wang_id = wang_set.wang_id_of(neighbor_cell)
        if neighbor_wang_id is None:
            desired.set_index_color(index, 0)  # Unknown tile, wildcard
            continue

        # The color on our side = the opposite side of the neighbor
        opposite = WangId.opposite_index(index)
        desired.set_index_color(index, neighbor_wang_id.index_color(opposite))

    return desired
```

**Key insight:** Index 0 (Top) on our tile shares a boundary with index 4 (Bottom) on the tile above us. `opposite_index(i) = (i + 4) % 8`.

### 5.3 Step 2: Find Best Match

```python
def find_best_match(wang_set, desired, mask):
    """
    Search all tiles (including transformed variants) for the best
    match to the desired WangId.

    Args:
        wang_set: The WangSet containing all tile->WangId mappings
        desired: The WangId we want
        mask: Which indices are constrained (non-zero bits = must match)

    Returns:
        Cell or None
    """
    lowest_penalty = float('inf')
    candidates = RandomPicker()  # weighted random selection

    for wang_id, cell in wang_set.all_wang_ids_and_cells():
        # HARD CONSTRAINT: masked indices must match exactly
        if (wang_id.value & mask) != (desired.value & mask):
            continue

        # SOFT CONSTRAINT: unmasked indices -- prefer closer colors
        total_penalty = 0
        valid = True

        for i in range(8):
            desired_color = desired.index_color(i)
            candidate_color = wang_id.index_color(i)

            if desired_color == 0:
                continue  # Wildcard, no constraint

            if desired_color == candidate_color:
                continue  # Perfect match

            # Look up transition distance
            distance = wang_set.color_distance(desired_color, candidate_color)

            if distance < 0:
                valid = False  # No transition path exists
                break

            total_penalty += distance

        if not valid:
            continue

        if total_penalty < lowest_penalty:
            candidates.clear()
            lowest_penalty = total_penalty

        if total_penalty == lowest_penalty:
            probability = wang_set.wang_id_probability(wang_id)
            if cell.tile():
                probability *= cell.tile().probability
            candidates.add(cell, probability)

    if candidates.is_empty():
        return None

    return candidates.pick()
```

### 5.4 Step 3: Apply to Map Region

When the user paints terrain, multiple tiles may need updating:

```python
def apply_terrain_paint(map, wang_set, fill_region, desired_colors):
    """
    Apply autotile fill to a region.

    The region includes all tiles that need recalculation:
    - The directly painted tiles
    - Their immediate neighbors (which may need new transitions)
    """
    for pos in fill_region:
        # Merge user's desired colors with neighbor constraints
        from_surroundings = wang_id_from_surroundings(map, pos.x, pos.y, wang_set)
        desired = desired_colors.get(pos, WangId())

        # Build mask: which indices are constrained?
        mask = compute_mask(from_surroundings, desired)
        merged = merge_wang_ids(from_surroundings, desired)

        # Find and place best match
        cell = find_best_match(wang_set, merged, mask)
        if cell:
            map.set_cell(pos.x, pos.y, cell)
        else:
            mark_invalid(pos)  # No valid tile exists
```

### 5.5 Indirect Transitions (Smart Paint Brush)

When a WangSet has colors that cannot transition directly (e.g., Dirt and Sand
with no Dirt-Sand tiles, only Dirt-Grass and Grass-Sand), the paint brush must
automatically insert intermediate terrain to bridge the gap.

**Example:** 3 colors — Grass(1), Dirt(2), Sand(3). Transition tiles exist for
Grass-Dirt and Grass-Sand, but NOT Dirt-Sand. The distance matrix is:

```
           Grass(1)  Dirt(2)  Sand(3)
Grass(1)      0        1        1
Dirt(2)       1        0        2      <-- no direct transition, path is Dirt->Grass->Sand
Sand(3)       1        2        0
```

#### Why the standard algorithm can't handle this

When you paint Sand at (5,5) into a field of Dirt, the standard algorithm
(Sections 5.2-5.4) resolves each cell independently. The tile at (6,5) gets:
- Left corners = Sand (hard constraint from the placed Sand at (5,5))
- Right corners = Dirt (hard constraint from the existing Dirt at (7,5))
- Desired: `[TL=Sand, TR=Dirt, BR=Dirt, BL=Sand]`

No tile has both Sand and Dirt corners. The hard constraint check in
`find_best_match` rejects every candidate. The cell is marked **invalid**.

Tiled's correction mechanism (`mCorrectionsEnabled` in `wangfiller.cpp`) handles
this for **edge-type** WangSets, but for **corner-type** sets (which TimeFantasy
uses), the correction cascade only checks edge indices — which are always 0 for
corner sets. So corrections never trigger.

**The standard matching algorithm cannot solve this case.** The fix belongs in
the paint brush, not the matcher.

#### Solution: Smart Paint Brush with Intermediate Color Rings

Instead of painting a single color and hoping the matcher figures it out, the
paint brush should **explicitly paint intermediate color rings** around the
target area before invoking the standard matcher.

```python
def smart_paint(map, wang_set, positions, color):
    """
    Paint terrain with automatic intermediate color insertion.

    When the painted color can't directly transition to a neighbor's color,
    this inserts rings of intermediate colors to bridge the gap. Then the
    standard autotile matcher fills in the correct transition tiles.

    Example: painting Sand(3) into Dirt(2) with distance matrix:
      dist(Sand, Dirt) = 2, path = Sand -> Grass -> Dirt

    Result:
      ... [Dirt] [Dirt-Grass] [Grass-Sand] [Sand] [Sand-Grass] [Grass-Dirt] [Dirt] ...
                 transition   transition   painted  transition   transition
    """
    positions = set(positions)

    # 1. Find the shortest-path intermediate colors between the painted
    #    color and each neighboring color using the distance matrix.
    #    Build concentric rings of intermediate colors outward.
    paint_colors = {}  # pos -> color to paint at that position
    for pos in positions:
        paint_colors[pos] = color

    border_rings = _compute_intermediate_rings(
        map, wang_set, positions, color
    )

    # Merge the intermediate rings into the paint map
    for ring_pos, ring_color in border_rings.items():
        if ring_pos not in paint_colors:
            paint_colors[ring_pos] = ring_color

    # 2. Now invoke the standard autotile matcher on the expanded region.
    #    Every adjacent pair in the expanded region has color distance <= 1,
    #    so the matcher will always find valid transition tiles.
    all_affected = set(paint_colors.keys())

    # Also include 1-tile border around the outermost ring for neighbor
    # transitions to the untouched map
    for pos in list(all_affected):
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                all_affected.add((pos[0] + dx, pos[1] + dy))

    apply_terrain_paint(map, wang_set, all_affected, paint_colors)


def _compute_intermediate_rings(map, wang_set, positions, color):
    """
    For each cell bordering the paint area, check if an intermediate
    terrain is needed. If the neighbor's color has distance > 1 from
    the painted color, insert rings of intermediate colors to bridge.

    Returns: dict of {(x,y): color_index} for intermediate cells
    """
    intermediates = {}  # pos -> color
    visited = set(positions)

    # BFS outward from the paint region
    current_ring = set()

    # Find initial border: cells adjacent to the paint region but not in it
    for pos in positions:
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                nb = (pos[0] + dx, pos[1] + dy)
                if nb not in visited:
                    current_ring.add(nb)

    ring_color = color  # The color we're transitioning FROM

    while current_ring:
        next_ring = set()

        for pos in current_ring:
            if pos in visited:
                continue
            visited.add(pos)

            # What color is currently at this position?
            existing_cell = map.cell_at(pos[0], pos[1])
            existing_wang_id = wang_set.wang_id_of(existing_cell)

            if existing_wang_id is None:
                continue

            # Get the dominant color of the existing tile
            existing_color = _dominant_color(existing_wang_id, wang_set)

            if existing_color == 0 or existing_color == ring_color:
                continue  # No transition needed

            distance = wang_set.color_distance(ring_color, existing_color)

            if distance <= 1:
                continue  # Direct transition exists, no intermediate needed

            # Distance > 1: we need an intermediate color.
            # Find the next color on the shortest path.
            intermediate = _next_color_on_path(
                wang_set, ring_color, existing_color
            )

            if intermediate is None:
                continue  # No path exists at all

            intermediates[pos] = intermediate

            # This ring becomes the new frontier — check if ITS neighbors
            # need another ring of intermediates
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    nb = (pos[0] + dx, pos[1] + dy)
                    if nb not in visited:
                        next_ring.add(nb)

        current_ring = next_ring
        # Update ring_color to the intermediate we just placed
        if intermediates:
            # Use the most recently placed intermediate as the new "from" color
            ring_color = next(iter(intermediates.values()))

    return intermediates


def _next_color_on_path(wang_set, from_color, to_color):
    """
    Find the next color on the shortest path from from_color to to_color.
    Uses the pre-computed distance matrix.

    Example: from_color=Sand(3), to_color=Dirt(2), path=Sand->Grass->Dirt
             returns Grass(1)
    """
    if wang_set.color_distance(from_color, to_color) <= 1:
        return None  # Direct transition, no intermediate needed

    best_next = None
    best_remaining = float('inf')

    for c in range(1, wang_set.color_count + 1):
        if c == from_color:
            continue

        dist_from = wang_set.color_distance(from_color, c)
        dist_to = wang_set.color_distance(c, to_color)

        if dist_from == 1 and 0 <= dist_to < best_remaining:
            best_next = c
            best_remaining = dist_to

    return best_next


def _dominant_color(wang_id, wang_set):
    """Get the most common non-zero color in a WangId."""
    counts = {}
    for i in range(8):
        c = wang_id.index_color(i)
        if c > 0:
            counts[c] = counts.get(c, 0) + 1
    if not counts:
        return 0
    return max(counts, key=counts.get)
```

#### Step-by-step walkthrough

Starting state: entire map is Dirt(2). User paints Sand(3) at (5,5).

```
Step 1 — smart_paint detects indirect transition:
  dist(Sand, Dirt) = 2. Path: Sand -> Grass -> Dirt.
  Need 1 ring of Grass around the Sand.

Step 2 — build paint_colors map:
  (5,5) = Sand(3)                         <- user painted
  (4,5), (6,5), (5,4), (5,6) = Grass(1)  <- auto-inserted intermediates
  (4,4), (6,4), (4,6), (6,6) = Grass(1)  <- diagonal intermediates

Step 3 — invoke standard matcher on expanded region:
  Every adjacent pair now has distance <= 1:
    Sand(3) <-> Grass(1): distance 1, transition tiles exist
    Grass(1) <-> Dirt(2): distance 1, transition tiles exist

Step 4 — matcher resolves each cell:
  (5,5): all corners Sand       -> full Sand tile
  (6,5): left=Sand, right=Grass -> Sand-to-Grass transition tile
  (7,5): left=Grass, right=Dirt -> Grass-to-Dirt transition tile
  (8,5): all corners Dirt        -> full Dirt tile (unchanged)
```

Result:
```
  [Dirt] [Grass-Dirt] [Sand-Grass] [Sand] [Sand-Grass] [Grass-Dirt] [Dirt]
         transition   transition   center  transition   transition
```

**2 transition tiles per direction. No full solid Grass tile — Grass only
appears as the shared color inside transition tiles.** Total footprint of
painting 1 tile = 5x5 (center + 2-tile transition border).

---

## 6. Tile Transformation System

Transformations dramatically increase tile coverage. A single 16-tile corner set can become 64 tiles with rotation, or 128 with rotation + flipping.

### 6.1 Generating Transformed Variants

```python
def generate_all_variants(wang_set, allow_rotate, allow_flip_h, allow_flip_v):
    """
    Pre-compute all valid tile variants and their WangIds.
    Called once when loading a tileset. Results are cached.
    """
    variants = []  # List of (WangId, Cell)

    for tile_id, base_wang_id in wang_set.tile_mapping.items():
        base_cell = Cell(wang_set.tileset_id, tile_id)

        # Start with the original
        orientations = [(base_wang_id, base_cell)]

        if allow_rotate:
            for rotations in [1, 2, 3]:  # 90, 180, 270
                rotated_wang = base_wang_id.rotated(rotations)
                rotated_cell = base_cell.rotated(rotations)
                orientations.append((rotated_wang, rotated_cell))

        if allow_flip_h:
            new_orientations = []
            for wang, cell in orientations:
                flipped_wang = wang.flipped_horizontally()
                flipped_cell = cell.flipped_horizontally()
                new_orientations.append((flipped_wang, flipped_cell))
            orientations.extend(new_orientations)

        if allow_flip_v:
            new_orientations = []
            for wang, cell in orientations:
                flipped_wang = wang.flipped_vertically()
                flipped_cell = cell.flipped_vertically()
                new_orientations.append((flipped_wang, flipped_cell))
            orientations.extend(new_orientations)

        # Deduplicate by WangId
        seen = set()
        for wang, cell in orientations:
            if wang.value not in seen:
                seen.add(wang.value)
                variants.append((wang, cell))

    return variants
```

### 6.2 How Cell Rotation Works

Rotating a Cell 90 CW is encoded as specific flip flag combinations:

```python
def rotate_cell_cw(cell):
    """Rotate cell 90 degrees clockwise using flip flags."""
    new_cell = Cell(cell.tileset_id, cell.tile_id)
    # Rotation matrix via flip flags:
    # 90 CW:  flipD=True, then swap flipH<->flipV, then invert flipH
    new_cell.flipH = cell.flipV
    new_cell.flipV = not cell.flipH
    new_cell.flipD = not cell.flipD
    return new_cell
```

> **Important:** When rendering, apply transforms in order: anti-diagonal flip -> horizontal flip -> vertical flip.

---

## 7. Transition Penalty System

When an exact match isn't available, the algorithm falls back to "close enough" matches using pre-computed color distances.

### 7.1 Distance Matrix

Pre-compute the minimum number of transition steps between any two colors:

```python
def compute_color_distances(wang_set):
    """
    Build a distance matrix between all colors.
    Distance 0 = same color
    Distance 1 = direct transition exists (a tile has both colors)
    Distance N = N intermediate transitions needed
    Distance -1 = no path exists
    """
    n = wang_set.color_count + 1  # +1 because colors are 1-based
    dist = [[-1] * n for _ in range(n)]

    # Self-distance = 0
    for i in range(1, n):
        dist[i][i] = 0

    # Find direct transitions from existing tiles
    for tile_id, wang_id in wang_set.tile_mapping.items():
        colors_in_tile = set()
        for idx in range(8):
            c = wang_id.index_color(idx)
            if c > 0:
                colors_in_tile.add(c)

        # All color pairs in this tile have distance 1
        for a in colors_in_tile:
            for b in colors_in_tile:
                if a != b:
                    dist[a][b] = 1
                    dist[b][a] = 1

    # Floyd-Warshall: find shortest paths
    changed = True
    while changed:
        changed = False
        for i in range(1, n):
            for j in range(1, n):
                if i == j:
                    continue
                for k in range(1, n):
                    if dist[i][k] < 0 or dist[k][j] < 0:
                        continue
                    new_dist = dist[i][k] + dist[k][j]
                    if dist[i][j] < 0 or new_dist < dist[i][j]:
                        dist[i][j] = new_dist
                        changed = True

    return dist
```

### 7.2 Usage in Matching

The penalty is the sum of distances for all unmatched indices. Lower penalty = better match. This means the algorithm prefers tiles that are "one step" away from ideal over tiles that are "three steps" away.

---

## 8. Weighted Random Tile Selection

When multiple tiles match equally well, select randomly using per-tile probabilities.

```python
class RandomPicker:
    """Weighted random selection. Used for choosing among equal-penalty candidates."""

    def __init__(self):
        self.items = []      # (cumulative_weight, value)
        self.total = 0.0

    def add(self, value, weight=1.0):
        if weight > 0:
            self.total += weight
            self.items.append((self.total, value))

    def pick(self):
        if len(self.items) == 1:
            return self.items[0][1]

        r = random.uniform(0, self.total)
        for threshold, value in self.items:
            if r <= threshold:
                return value
        return self.items[-1][1]  # Edge case: floating point

    def is_empty(self):
        return len(self.items) == 0

    def clear(self):
        self.items = []
        self.total = 0.0
```

**Probability comes from two sources:**
1. `Tile.probability` — per-tile weight (e.g., make a grass variant rarer)
2. `WangColor.probability` — per-color weight (e.g., prefer cleaner transitions)

The final weight is: `tile.probability * wang_set.wang_id_probability(wang_id)`

Where `wang_id_probability` is the product of all color probabilities in the WangId.

---

## 9. Runtime Engine Integration

### 9.1 Initialization (Load Time)

```python
def initialize_autotile_system(tileset_path, metadata_path):
    """Called once when loading a tileset."""

    # 1. Load tileset image and cut into tiles
    tileset = load_tileset(tileset_path)

    # 2. Load autotile metadata (see AUTOTILE_JSON_SCHEMA.md)
    metadata = load_json(metadata_path)

    # 3. Build WangSets
    for ws_data in metadata["wangsets"]:
        wang_set = WangSet(
            name=ws_data["name"],
            type=ws_data["type"],
            tileset=tileset
        )

        # Add colors
        for color_data in ws_data["colors"]:
            wang_set.add_color(WangColor(
                name=color_data["name"],
                color=parse_color(color_data["color"]),
                probability=color_data["probability"],
                image_tile_id=color_data["tile"]
            ))

        # Add tile->WangId mappings
        for tile_data in ws_data["wangtiles"]:
            wang_set.set_wang_id(
                tile_id=tile_data["tileid"],
                wang_id=WangId.from_array(tile_data["wangid"])
            )

        # 4. Pre-compute transformed variants
        wang_set.all_cells = generate_all_variants(
            wang_set,
            allow_rotate=tileset.allow_rotate,
            allow_flip_h=tileset.allow_flip_h,
            allow_flip_v=tileset.allow_flip_v
        )

        # 5. Pre-compute color distances
        wang_set.color_distances = compute_color_distances(wang_set)

        tileset.add_wang_set(wang_set)
```

### 9.2 Runtime Painting

Use `smart_paint()` from Section 5.5 for full indirect transition support.
This automatically inserts intermediate terrain rings when colors can't
transition directly (e.g., Grass border between Dirt and Sand).

```python
def on_paint_terrain(map, wang_set, position, color):
    """
    Called when the user/system wants to paint terrain color at a position.
    Uses the smart paint brush to handle indirect transitions.
    """

    # Delegate to smart_paint (Section 5.5)
    # This detects if intermediate colors are needed (e.g., Grass between
    # Dirt and Sand), inserts them, then invokes the standard matcher.
    smart_paint(map, wang_set, {position}, color)
```

### 9.3 Rendering Transformed Tiles

When rendering a Cell with flip flags:

```python
def render_tile(renderer, cell, screen_x, screen_y, tile_size):
    """Render a tile with its transformation flags applied."""

    tile_image = get_tile_image(cell.tileset_id, cell.tile_id)

    # Apply transforms in order: anti-diagonal -> horizontal -> vertical
    if cell.flipD:
        tile_image = transpose(tile_image)  # Swap X<->Y axes
    if cell.flipH:
        tile_image = flip_horizontal(tile_image)
    if cell.flipV:
        tile_image = flip_vertical(tile_image)

    renderer.draw(tile_image, screen_x, screen_y)
```

---

## 10. Reference: Tile Count Math

### Corner Type (most common for RPG tilesets)

| Colors | Unique WangIds | With Rotation (x4) | With Rotation+FlipH (x8) |
|--------|---------------|--------------------|-----------------------|
| 2      | 16            | up to 64           | up to 128             |
| 3      | 81            | up to 324          | up to 648             |
| 4      | 256           | up to 1024         | up to 2048            |

Formula: `N^4` unique corner combinations for N colors.

### Practical Guidance

For TimeFantasy with 2 terrain types (e.g., grass/dirt):
- **Minimum:** 16 tiles (all corner combinations)
- **With rotation enabled:** You can get away with ~6 base tiles if the art is symmetric
- **Recommended:** 16 base tiles + a few extra probability variants for visual variety

### What "Complete" Means

A Wang set is **complete** when every possible WangId combination that could appear on the map has at least one matching tile. Incomplete sets cause the algorithm to either:
- Fall back to penalty-based "close enough" matching
- Leave tiles marked as invalid (no match found)

---

## 11. Implementation Checklist

### Phase 1: Data Model
- [ ] Implement `WangId` class with bit packing, rotation, flipping
- [ ] Implement `WangColor` struct
- [ ] Implement `WangSet` class with tile->WangId mapping
- [ ] Implement `Cell` struct with flip flags
- [ ] Implement `RandomPicker` weighted random selection
- [ ] Implement JSON load/save for the metadata format (see AUTOTILE_JSON_SCHEMA.md)

### Phase 2: Algorithm Core
- [ ] `wang_id_from_surroundings()` — read neighbor constraints
- [ ] `find_best_match()` — candidate search with penalty scoring
- [ ] `compute_color_distances()` — Floyd-Warshall transition matrix
- [ ] `generate_all_variants()` — pre-compute rotated/flipped tiles
- [ ] `apply()` — fill region with best matches

### Phase 3: Runtime Integration
- [ ] Load metadata on tileset init
- [ ] Pre-compute variant cache and distance matrix
- [ ] Terrain paint brush (paint + update neighbors)
- [ ] Terrain fill tool (flood fill with autotiling)
- [ ] Render tiles with flip/rotation flags
- [ ] Handle animated tiles (water) — run autotile per animation frame

---

## Appendix A: Quick Reference — Neighbor Index Mapping

When reading a neighbor tile's WangId to determine what color we need:

```
Our Index    Meaning         Neighbor Offset    Neighbor's Index
---------    -------         ---------------    ----------------
0 (Top)      Top edge        (0, -1)            4 (Bottom)
1 (TopRight) TR corner       (1, -1)            5 (BottomLeft)
2 (Right)    Right edge      (1, 0)             6 (Left)
3 (BR)       BR corner       (1, 1)             7 (TopLeft)
4 (Bottom)   Bottom edge     (0, 1)             0 (Top)
5 (BL)       BL corner       (-1, 1)            1 (TopRight)
6 (Left)     Left edge       (-1, 0)            2 (Right)
7 (TopLeft)  TL corner       (-1, -1)           3 (BottomRight)
```

Rule: `neighbor_index = (our_index + 4) % 8`

## Appendix B: Standard 16-Tile Corner Layout

Visual reference for a 2-color (A/B) corner set laid out in a 4x4 grid.
Each cell shows [TL, TR, BR, BL] corner colors:

```
Row 0:  [A,A,A,A]  [B,A,A,A]  [A,B,A,A]  [B,B,A,A]
Row 1:  [A,A,B,A]  [B,A,B,A]  [A,B,B,A]  [B,B,B,A]
Row 2:  [A,A,A,B]  [B,A,A,B]  [A,B,A,B]  [B,B,A,B]
Row 3:  [A,A,B,B]  [B,A,B,B]  [A,B,B,B]  [B,B,B,B]
```

This is a binary counting pattern where TL=bit3, TR=bit2, BR=bit1, BL=bit0.

## Appendix C: Common RPG Tileset Layout Patterns

Many RPG tilesets (including TimeFantasy) arrange their autotile pieces in a specific visual pattern rather than the binary counting pattern above. A common layout is:

```
Interior tile:          [B,B,B,B]   (center of terrain B area)
Top edge:               [A,A,B,B]   (only the top-left portion shown)
Bottom-right outer:     [B,A,B,B]   (convex corner)
Top-right inner:        [B,B,A,B]   (concave corner)
```

Your editor should support **both** assignment methods:
1. Manual per-tile assignment (most flexible)
2. Template-based batch assignment (faster for standard layouts)
