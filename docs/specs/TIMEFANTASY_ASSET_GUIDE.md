# TimeFantasy Asset Guide

> How to apply the autotile system specifically to the TimeFantasy 16x16 tile assets.
>
> Related documents:
> - [Autotile Engine Spec](./AUTOTILE_ENGINE_SPEC.md) — algorithm and data model
> - [Tile Metadata Editor Spec](./TILE_METADATA_EDITOR_SPEC.md) — the tool for tagging tiles
> - [JSON Schema](./AUTOTILE_JSON_SCHEMA.md) — the metadata format

---

## 1. Asset Overview

```
my_assets/TimeFantasy_TILES_6.24.17/
+-- TILESETS/
|   +-- terrain.png        # Grass, dirt, rock, sand variations
|   +-- outside.png        # Outdoor: forests, mountains, cliffs
|   +-- water.png          # Animated water (3-frame)
|   +-- inside.png         # Indoor environments
|   +-- dungeon.png        # Caves, mines, ruins
|   +-- castle.png         # Castle tiles
|   +-- desert.png         # Desert themed
|   +-- house.png          # Buildings with multiple roof colors
|   +-- world.png          # World map tiles
|   +-- animated/          # Doors, fireplaces, torches, puzzles
+-- guide.png              # Visual usage guide
```

**Tile size: 16x16 pixels.**

---

## 2. Terrain Categories to Define

Based on the TimeFantasy guide, you need these WangSets:

### WangSet: "Ground Terrain" (Corner type)
- **Colors:** Grass(1), Dirt(2), Sand(3), Rock(4)
- **Source:** `terrain.png`
- For each pair (Grass<->Dirt, Grass<->Sand, Dirt<->Rock, etc.), you need the 16-tile corner set
- The guide shows terrain variations that add visual variety to same-terrain tiles

### WangSet: "Water" (Corner type)
- **Colors:** Land(1), ShallowWater(2), DeepWater(3)
- **Source:** `water.png`
- Water uses 3-frame animation; each frame needs its own set of 16 corner tiles
- The guide notes: "Water uses a three frame animation. For best results, use a 1-2-3-2 pattern."

### WangSet: "Cliffs" (Edge type — or manual/non-Wang)
- **Source:** `outside.png`
- Cliffs labeled in guide: A=flat top, B=corners, C=smooth edges, D=inner blend, E=straight edges, F=joining tubes
- **These may be better handled manually** or with a specialized cliff placement system rather than generic Wang tiles

### WangSet: "Forest Canopy" (Corner type)
- **Colors:** Open(1), TreeCanopy(2)
- **Source:** `outside.png`
- Guide labels: A=canopy bottom, B=inverse corners, C=trunk corners, D=trunk sides, E=canopy depth

---

## 3. Tile ID Calculation

For a tileset PNG with known width:

```python
def tile_id(tileset_width_px, tile_size, col, row):
    """Convert grid position to tile ID."""
    cols = tileset_width_px // tile_size
    return row * cols + col

def tile_rect(tileset_width_px, tile_size, tile_id):
    """Get pixel rectangle for a tile ID."""
    cols = tileset_width_px // tile_size
    col = tile_id % cols
    row = tile_id // cols
    return (col * tile_size, row * tile_size, tile_size, tile_size)
```

---

## 4. Water Animation Setup

Water tiles in TimeFantasy use 3-frame animation with a ping-pong playback pattern (1-2-3-2-1-2-3-2...).

In the metadata editor:
1. Create a WangSet "Water Edges" with colors Land(1) and Water(2)
2. Mark it as "Animated" with 3 frames
3. Determine the tile ID offset between frames (measure in the spritesheet)
4. Tag only frame 1's tiles — the editor copies assignments to frames 2 and 3
5. Set `"pattern": "ping-pong"` in the animation metadata

The runtime engine should:
- Use the current animation frame to offset tile IDs when rendering
- All frames share the same WangId assignments, so autotile matching only runs once

---

## 5. Cliffs and Mountains — Special Handling

The TimeFantasy guide labels cliff tiles A through F:
- **A**: Flat cliff tops
- **B**: Cliff corner pieces
- **C**: Smooth cliff edges
- **D**: Inner blend transitions
- **E**: Straight cliff edges
- **F**: Joining tubes (connecting horizontal and vertical cliffs)

Cliffs don't fit neatly into the standard Wang tile corner model because:
- They have vertical height (multi-tile structures)
- The top/side/bottom of a cliff are different tile types, not just corner transitions
- Joining rules depend on more than just the 8 immediate neighbors

**Recommended approach:** Handle cliffs with either:
1. **Edge-type Wang tiles** for the cliff-top boundary (where the cliff edge meets flat ground)
2. **AutoMap rules** (pattern-based replacement) for multi-tile cliff structures
3. **Manual placement** with the cliff pieces as a categorized palette

---

## 6. Implementation Checklist — Asset Authoring

- [ ] Map `terrain.png` tiles to Ground Terrain WangSet (Grass/Dirt/Sand/Rock)
- [ ] Map `water.png` tiles to Water WangSet (3 animation frames, ping-pong)
- [ ] Map `outside.png` forest tiles to Forest Canopy WangSet
- [ ] Map `desert.png` tiles to Desert Terrain WangSet
- [ ] Map `dungeon.png` tiles to Dungeon Floor WangSet
- [ ] Map `castle.png` tiles to Castle Floor WangSet
- [ ] Handle cliff/mountain tiles (edge-type WangSet or manual approach)
- [ ] Create test maps to verify all transitions look correct
- [ ] Add probability variants for visual variety
- [ ] Verify completeness for each WangSet (all 16+ combinations covered)
