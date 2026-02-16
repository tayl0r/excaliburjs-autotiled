# Tile Metadata Editor Spec — Standalone Asset Pipeline Tool

> This is a **standalone application**, completely separate from the map editor.
> Its sole purpose is to take raw tileset spritesheet PNGs and produce the JSON
> metadata files that the autotile engine needs.
>
> Related documents:
> - [Autotile Engine Spec](./AUTOTILE_ENGINE_SPEC.md) — algorithm and data model
> - [JSON Schema](./AUTOTILE_JSON_SCHEMA.md) — the metadata format this tool produces
> - [TimeFantasy Asset Guide](./TIMEFANTASY_ASSET_GUIDE.md) — applying this to the TimeFantasy assets

---

## Table of Contents

1. [What This Tool Does (and Doesn't Do)](#1-what-this-tool-does)
2. [The Workflow — Step by Step](#2-the-workflow)
3. [Editor UI Layout](#3-editor-ui-layout)
4. [Core Features Detailed](#4-core-features-detailed)
5. [Multi-Tileset Workflow](#5-multi-tileset-workflow)
6. [Handling Animation Frames](#6-handling-animation-frames)
7. [Layout Pattern Definitions](#7-layout-pattern-definitions)
8. [Undo/Redo](#8-undoredo)
9. [Keyboard Shortcuts](#9-keyboard-shortcuts)
10. [Implementation Checklist](#10-implementation-checklist)

---

## 1. What This Tool Does (and Doesn't Do)

**Does:**
- Loads raw spritesheet PNG files and displays them as individual tiles
- Lets you categorize and tag individual tiles with terrain metadata
- Lets you define terrain types (WangColors) and terrain groups (WangSets)
- Lets you assign WangIds to tiles (the core tagging operation)
- Validates that your tagging is complete (no missing transitions)
- Previews how tagged tiles would look when placed next to each other
- Exports JSON metadata files for the runtime autotile engine
- Manages metadata across multiple tilesets in a project

**Does NOT:**
- Create or edit maps
- Run the autotile matching algorithm at full scale
- Render game scenes

No map editing happens here — this tool exists in the asset pipeline, before any maps are created.

---

## 2. The Workflow — Step by Step

This is the complete workflow an artist/designer follows to take a raw spritesheet and produce usable autotile metadata.

### Step 1: Create a Project

A project groups all tilesets for a game. It tracks:
- A project root directory (where assets and metadata live)
- A list of registered tilesets
- Global settings (default tile size, transformation flags)

```json
{
  "projectName": "TimeFantasy RPG",
  "defaultTileSize": [16, 16],
  "tilesets": [
    { "image": "terrain.png", "metadata": "terrain.autotile.json" },
    { "image": "outside.png", "metadata": "outside.autotile.json" },
    { "image": "water.png", "metadata": "water.autotile.json" }
  ]
}
```

### Step 2: Import a Tileset Spritesheet

Load a PNG spritesheet and specify how to slice it:
- **Image path**: e.g., `terrain.png`
- **Tile size**: width and height in pixels (16x16 for TimeFantasy)
- **Margin**: pixels of padding around the entire image (0 for TimeFantasy)
- **Spacing**: pixels between tiles in the grid (0 for TimeFantasy)

The tool slices the image into a grid and assigns each tile an integer **tile ID** (left-to-right, top-to-bottom, zero-indexed):

```
Tile IDs for a 16-column spritesheet:
 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
32 33 34 35 36 37 ...
```

The tileset viewer shows all tiles in a scrollable, zoomable grid.

### Step 3: Define Terrain Types (WangColors)

Before tagging tiles, you define what terrain types exist. Each terrain type becomes a **WangColor**:

| Property | Example | Purpose |
|----------|---------|---------|
| **Name** | "Grass" | Human label for this terrain |
| **Display Color** | `#00ff00` | Overlay color shown on tagged tiles in the editor |
| **Probability** | `1.0` | Weight for random selection (higher = more likely) |
| **Representative Tile** | tile 0 | Shown in the UI as the icon for this terrain |

For TimeFantasy `terrain.png`, you might define:
1. Grass (green)
2. Dirt (brown)
3. Sand (yellow)
4. Stone (gray)

### Step 4: Create a WangSet (Terrain Group)

A **WangSet** defines which terrain types can transition between each other. Each WangSet has:

| Property | Example | Purpose |
|----------|---------|---------|
| **Name** | "Ground Terrain" | Human label |
| **Type** | Corner / Edge / Mixed | Which WangId indices are active (see Engine Spec Section 3) |
| **Colors** | [Grass, Dirt] | Which WangColors participate |
| **Tiles** | (assigned in Step 5) | Which tiles belong to this set |

**Why separate WangSets?** You might have:
- "Ground Terrain" (Grass <-> Dirt transitions) — corner type
- "Water Edges" (Water <-> Grass transitions) — corner type, 3 animation frames
- "Cliff Tops" (Cliff <-> Ground transitions) — edge type

Each WangSet is independent — the autotile engine queries one at a time.

### Step 5: Tag Individual Tiles with WangIds (THE CORE OPERATION)

This is the most important step. For each tile that participates in a WangSet, you must assign a **WangId** — an 8-index array that describes what terrain type is at each corner and edge of that tile.

**What the artist is actually doing:** Looking at a tile image, deciding "the top-left corner of this tile is grass, the top-right corner is dirt, the bottom-right is dirt, the bottom-left is grass," and recording that as `[0, 2, 0, 2, 0, 1, 0, 1]` (for a corner set: edges are 0, corners carry the terrain colors).

The editor provides **three methods** for doing this:

#### Method A: Click-to-Paint (Per-Index)

The most flexible method. Works for any tile layout.

1. Select the active WangColor (e.g., "Grass")
2. Click a tile in the tileset viewer to select it
3. The tile zooms into an **index editor** that shows the 8 clickable zones:

```
+---------------------+
|  [TL]  [Top]  [TR]  |     TL = index 7 (corner)
|  [Left] [X] [Right] |     Top = index 0 (edge)
|  [BL] [Bottom] [BR] |     TR = index 1 (corner)
|                      |     ... etc.
|  Click a zone to     |
|  assign active color |
+---------------------+
```

4. Click a zone -> it's assigned the active color
5. The zone renders with the color's display color (semi-transparent overlay)
6. Click again with a different active color to change it
7. Right-click to clear (set to 0 / unassigned)

For **corner-type** WangSets, only the 4 corner zones (TL, TR, BR, BL) are active. Edge zones are locked to 0.

#### Method B: Template Drag-and-Drop (Batch for Standard Layouts)

Faster for standard RPG tilesets that follow a known layout pattern. The editor shows the **16-tile corner template** (see Engine Spec Appendix B) as empty slots:

```
Template for 2-color corner set (Color A = Grass, Color B = Dirt):

  [A,A,A,A]  [B,A,A,A]  [A,B,A,A]  [B,B,A,A]
  [A,A,B,A]  [B,A,B,A]  [A,B,B,A]  [B,B,B,A]
  [A,A,A,B]  [B,A,A,B]  [A,B,A,B]  [B,B,A,B]
  [A,A,B,B]  [B,A,B,B]  [A,B,B,B]  [B,B,B,B]

  Each slot shows the expected corner pattern.
  Drag a tile from the spritesheet onto a slot to assign it.
```

When a tile is dropped onto a template slot, the editor auto-assigns the WangId based on the slot's position. This tags 16 tiles in seconds instead of clicking 64 individual zones.

#### Method C: Region Auto-Detect

For tilesets that arrange autotile groups in known rectangular patterns (like RPG Maker format):
1. Select a rectangular region of tiles in the spritesheet
2. Choose two WangColors (primary and secondary)
3. Choose a layout pattern (e.g., "RPG Maker VX", "Standard 4x4 Binary", "TimeFantasy Ground")
4. The tool assigns WangIds to all tiles in the region based on the pattern mapping

This requires pre-defined layout pattern definitions (see Section 7).

### Step 6: Verify Assignments

After tagging, run validation:

**Completeness Check:**
- For each WangSet, enumerate all possible WangId combinations
- For corner type with N colors: N^4 combinations (2 colors = 16, 3 colors = 81)
- Flag any combination that has no tile assigned
- Display: "Ground Terrain: 16/16 complete" or "Ground Terrain: 14/16 -- MISSING 2"
- List the specific missing combinations by their corner values

**Adjacency Preview:**
- Select a tagged tile, see what tiles the algorithm would place next to it
- Show a 3x3 preview grid: the selected tile in the center, valid neighbors auto-filled around it
- This catches mistakes like "I accidentally swapped two corners"

**Duplicate Check:**
- Warn if two tiles have the same WangId in the same WangSet (this is fine — they become probability variants — but the user should be aware)

### Step 7: Configure Tile Transformations

Specify which transformations the autotile engine is allowed to apply:

| Setting | Effect | Use When |
|---------|--------|----------|
| Allow Horizontal Flip | Mirrors tiles left-to-right | Tiles are horizontally symmetric |
| Allow Vertical Flip | Mirrors tiles top-to-bottom | Tiles are vertically symmetric |
| Allow Rotation | 90/180/270 degree rotations | Tiles work in all orientations |
| Prefer Untransformed | Penalty for using transforms | Originals look better than transforms |

The editor shows the impact: "16 base tiles x 8 orientations = up to 128 effective variants"

For TimeFantasy: most ground terrain tiles can safely use horizontal flip. Rotation depends on the specific art.

### Step 8: Export Metadata JSON

Save all tagging work to a JSON file per tileset (format in AUTOTILE_JSON_SCHEMA.md). This file is what the autotile engine loads at runtime.

---

## 3. Editor UI Layout

```
+--------------------------------------------------------------------------+
|  [File] [Edit] [View] [Tools]            Project: TimeFantasy RPG        |
+--------------------+---------------------------------------------------------+
|  TILESETS          |  SPRITESHEET VIEWER (scrollable, zoomable)           |
|  +--------------+  |  +---------------------------------------------+    |
|  | terrain.png  |  |  | [tile][tile][tile][tile][tile][tile]...      |    |
|  | outside.png  |  |  | [tile][tile][tile][tile][tile][tile]...      |    |
|  | water.png    |  |  | [tile][tile][tile][tile][tile][tile]...      |    |
|  | [+ Import]   |  |  |                                             |    |
|  +--------------+  |  | Tagged tiles show semi-transparent color     |    |
|                    |  | overlays on their corners/edges.             |    |
|  WANGSETS          |  |                                              |    |
|  +--------------+  |  | Untagged tiles appear with no overlay.       |    |
|  | Ground       |  |  +---------------------------------------------+    |
|  | Water        |  |                                                     |
|  | Forest       |  +-----------------------------------------------------+
|  | [+ Create]   |  |  TILE INSPECTOR (shows when a tile is selected)     |
|  +--------------+  |  +------------------+-------------------------+      |
|                    |  |  Tile #42         |  WangId Index Editor    |      |
|  WANGCOLORS        |  |  +----------+    |  +-------------------+  |      |
|  (for selected     |  |  |          |    |  |  [TL] [T ] [TR]   |  |      |
|   WangSet)         |  |  |  16x16   |    |  |  [L ] [  ] [R ]   |  |      |
|  +--------------+  |  |  |  preview |    |  |  [BL] [B ] [BR]   |  |      |
|  | 1: Grass  ## |  |  |  |  (zoom) |    |  |  click to assign   |  |      |
|  | 2: Dirt   ## |  |  |  +----------+    |  +-------------------+  |      |
|  | 3: Sand   ## |  |  |  WangSet: Ground |  Probability: [1.0]    |      |
|  | [+ Add]      |  |  |  WangId: [0,2,0,1,0,1,0,2]                |      |
|  +--------------+  |  +------------------+-------------------------+      |
|                    |                                                      |
|  ACTIVE COLOR: [1] +------------------------------------------------------+
|  MODE: Corner      |  STATUS BAR                                          |
|                    |  Ground: 16/16 complete | Water: 12/16 (4 missing)   |
+--------------------+------------------------------------------------------+
```

---

## 4. Core Features Detailed

### Feature 1: Tileset Import and Navigation

- Load PNG spritesheet; input tile size, margin, spacing
- Display tiles in a scrollable, zoomable grid
- Show tile ID on hover (or as a toggleable overlay)
- Click a tile to select it -> opens the Tile Inspector panel
- Multi-select tiles (shift-click range, ctrl-click individuals) for batch operations
- **Filter/search**: filter the view to show only tagged tiles, only untagged tiles, or tiles belonging to a specific WangSet

### Feature 2: WangSet Management

- Create: name, type (Corner/Edge/Mixed), select an icon tile
- Delete: removes WangSet and all its tile assignments (with confirmation)
- Rename, change type (warns if tiles have incompatible assignments)
- Each WangSet maintains its own independent set of WangColors and tile assignments

### Feature 3: WangColor Management (within a WangSet)

- Create: name, display color (color picker), probability, representative tile
- Reorder colors (color index matters — it's what gets stored in WangIds)
- Delete: removes color and clears it from all tile WangIds (with confirmation)
- Edit probability (default 1.0; higher = more likely when multiple tiles match)

### Feature 4: Tile Tagging (WangId Assignment)

The three assignment methods from Section 2 Step 5. Additional details:

**Click-to-Paint specifics:**
- For **corner-type** WangSets: only 4 zones active (TL, TR, BR, BL). The 4 edge zones are grayed out.
- For **edge-type** WangSets: only 4 zones active (T, R, B, L). The 4 corner zones are grayed out.
- For **mixed-type** WangSets: all 8 zones active.
- Keyboard shortcut: number keys 1-9 switch the active color
- Hold Shift + click = erase (set to 0)
- The current WangId is displayed as both the visual overlay and the raw `[0,2,0,1,0,1,0,2]` array

**Template matching specifics:**
- Open via menu: Tools -> Template Assignment
- Choose which 2 WangColors map to A and B
- Slots that already have a tile show the tile; empty slots show the expected pattern
- Dragging a tile onto an occupied slot replaces it (old tile keeps its assignment, can be cleared separately)
- "Auto-fill" button: if the spritesheet has tiles in the standard 4x4 layout, select the top-left tile and auto-fill all 16

**Removing a tag:**
- Right-click a tile in the spritesheet view -> "Remove from WangSet"
- Or select tile, press Delete
- Clearing a tile's WangId removes it from the WangSet's tile list

### Feature 5: Visual Overlay on Tagged Tiles

Every tagged tile in the spritesheet viewer gets a semi-transparent overlay:

```python
def draw_wang_overlay(painter, tile_rect, wang_id, wang_set):
    """Draw colored indicators on a tile showing its Wang assignment."""
    x, y, w, h = tile_rect

    for index in range(8):
        color_idx = wang_id.index_color(index)
        if color_idx == 0:
            continue

        display_color = wang_set.colors[color_idx - 1].display_color
        display_color.alpha = 180  # Semi-transparent

        if WangId.is_corner(index):
            # Draw colored triangle in the corner
            # index 7=TL, 1=TR, 3=BR, 5=BL
            draw_corner_triangle(painter, x, y, w, h, index)
        else:
            # Draw colored rectangle on the edge
            # index 0=Top, 2=Right, 4=Bottom, 6=Left
            draw_edge_rect(painter, x, y, w, h, index)
```

This gives an at-a-glance view of the entire spritesheet showing which tiles are tagged and what terrain type each corner/edge is.

### Feature 6: Completeness Validation

- Runs automatically when assignments change; also available on-demand
- Shows per-WangSet status in the status bar
- Detail panel lists every missing WangId combination:
  ```
  Ground Terrain: INCOMPLETE (14/16)
  Missing:
    [0, 2, 0, 2, 0, 1, 0, 1]  -- TL=Dirt, TR=Dirt, BR=Grass, BL=Grass
    [0, 1, 0, 1, 0, 2, 0, 2]  -- TL=Grass, TR=Grass, BR=Dirt, BL=Dirt
  ```
- Click a missing combination -> highlights where it would be needed in the adjacency preview

### Feature 7: Adjacency Preview (Test Your Tags)

A critical verification tool. Select a tagged tile and see a simulated 3x3 or 5x5 grid:
- The selected tile is placed in the center
- The tool runs the matching algorithm to fill surrounding cells
- This shows you what the autotiler would actually produce with your current tagging
- If neighbors look wrong, your WangId assignment has an error

```
+-----------------------------------+
|  ADJACENCY PREVIEW                |
|  +-------+-------+-------+       |
|  |  ?    |  ?    |  ?    |       |
|  +-------+-------+-------+       |
|  |  ?    |  SEL  |  ?    |  <-- Selected tile in center
|  +-------+-------+-------+       |
|  |  ?    |  ?    |  ?    |       |
|  +-------+-------+-------+       |
|  ? = best matching tile from      |
|      the same WangSet             |
+-----------------------------------+
```

### Feature 8: Transformation Configuration

Per-tileset settings that affect how many effective variants the engine can produce:
- Checkboxes: Allow Flip H, Allow Flip V, Allow Rotation
- Checkbox: Prefer Untransformed (add penalty for transformed variants)
- Impact display: "16 base tiles -> up to 128 effective variants"
- **Preview**: toggle a button to see all generated variants for the selected tile (original + all allowed transforms), with the transformed WangIds shown

---

## 5. Multi-Tileset Workflow

For a game like TimeFantasy with multiple spritesheets:

| Tileset | WangSets to Create | Notes |
|---------|-------------------|-------|
| `terrain.png` | Ground Terrain (grass/dirt/sand/stone) | Main overworld ground |
| `outside.png` | Forest Canopy (trees/ground), Path (path/grass) | Multiple WangSets per sheet |
| `water.png` | Water Edges (water/ground) | 3 animation frames — see below |
| `desert.png` | Desert Terrain (sand/rock/cactus ground) | Similar to terrain.png |
| `dungeon.png` | Dungeon Floor (stone/void) | Interior tileset |
| `castle.png` | Castle Floor (carpet/stone) | Interior tileset |

The editor keeps all of these open in a tabbed or tree-view interface. Each tileset has its own independent set of WangSets, WangColors, and tile assignments.

---

## 6. Handling Animation Frames

For animated tiles (like water in TimeFantasy), the metadata needs to track which tiles form animation sequences:

1. In the editor, tag each animation frame's tiles with the **same WangIds**
2. Group the frames into an animation sequence:

```json
{
  "animations": [
    {
      "name": "Water",
      "frameCount": 3,
      "frameDuration": 200,
      "pattern": "ping-pong",
      "frames": [
        { "tileIdOffset": 0,  "description": "Frame 1" },
        { "tileIdOffset": 48, "description": "Frame 2" },
        { "tileIdOffset": 96, "description": "Frame 3" }
      ]
    }
  ]
}
```

The offset means: if the autotiler picks tile 5 for frame 1, then frame 2 is tile 53, frame 3 is tile 101. All frames share the same WangId assignments.

In the editor UI:
- Mark a WangSet as "Animated"
- Specify number of frames and the tile ID offset between frames
- Only tag one frame's tiles — the editor copies the assignments to other frames automatically
- Preview shows the animation playing

---

## 7. Layout Pattern Definitions (for Method C: Region Auto-Detect)

Pre-defined mappings from spatial position in a rectangular region to WangId. These encode the conventions of popular tileset formats.

**Standard 4x4 Binary (see Engine Spec Appendix B):**
```python
STANDARD_4x4_BINARY = {
    # (col, row) -> [TL, TR, BR, BL] where 1=primary, 2=secondary
    (0,0): [1,1,1,1], (1,0): [2,1,1,1], (2,0): [1,2,1,1], (3,0): [2,2,1,1],
    (0,1): [1,1,2,1], (1,1): [2,1,2,1], (2,1): [1,2,2,1], (3,1): [2,2,2,1],
    (0,2): [1,1,1,2], (1,2): [2,1,1,2], (2,2): [1,2,1,2], (3,2): [2,2,1,2],
    (0,3): [1,1,2,2], (1,3): [2,1,2,2], (2,3): [1,2,2,2], (3,3): [2,2,2,2],
}
```

**RPG Maker VX/MV A2 Layout (common in RPG tilesets):**
```python
# RPG Maker uses a 2x3 mini-tile composition system.
# This mapping converts the RPG Maker layout to Wang corner IDs.
# The exact mapping depends on the specific RPG Maker format.
RPGMAKER_VX_LAYOUT = {
    # ... (to be defined based on the specific RPG Maker autotile layout)
}
```

Artists can also **create custom layout patterns** in the editor for non-standard tilesets.

---

## 8. Undo/Redo

All tagging operations are undoable:
- Assign WangId -> undo restores previous WangId (or removes if new)
- Create WangSet / WangColor -> undo removes it
- Batch template assignment -> undo removes all 16 assignments at once
- Delete operations -> undo restores the deleted item

Standard Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y.

---

## 9. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| 1-9 | Select WangColor by index |
| Delete | Remove selected tile(s) from current WangSet |
| Shift+Click | Erase (set zone to 0) |
| Ctrl+Click | Multi-select tiles |
| Space | Toggle overlay visibility |
| +/- | Zoom in/out on spritesheet |
| Ctrl+S | Save metadata |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| T | Open template matching view |
| P | Toggle adjacency preview |

---

## 10. Implementation Checklist

- [ ] Project management (create/open project, register tilesets)
- [ ] Tileset image loader (split PNG into tile grid, scrollable/zoomable viewer)
- [ ] Tile selection and inspection (click to select, tile ID display, zoom preview)
- [ ] Multi-select tiles (shift-click range, ctrl-click individuals)
- [ ] Filter/search (tagged vs untagged, filter by WangSet)
- [ ] WangSet creation/management UI (name, type, icon tile)
- [ ] WangColor creation/management UI (name, color picker, probability, representative tile)
- [ ] Tile tagging Method A: click-to-paint per-index WangId assignment
- [ ] Tile tagging Method B: template drag-and-drop (16-slot corner template)
- [ ] Tile tagging Method C: region auto-detect with layout pattern definitions
- [ ] Color overlay rendering on tagged tiles in spritesheet viewer
- [ ] Completeness validation (list missing WangId combinations per WangSet)
- [ ] Adjacency preview (3x3 grid showing what neighbors would be placed)
- [ ] Transformation configuration (flip H/V, rotation, prefer untransformed)
- [ ] Transformation preview (show all generated variants for selected tile)
- [ ] Animation frame support (mark WangSet as animated, frame offsets, auto-copy tags)
- [ ] Layout pattern definitions (standard 4x4 binary, RPG Maker VX, custom patterns)
- [ ] Save/load metadata JSON files (see AUTOTILE_JSON_SCHEMA.md)
- [ ] Multi-tileset workflow (tabbed interface, per-tileset metadata)
- [ ] Undo/redo for all tagging operations
- [ ] Keyboard shortcuts
