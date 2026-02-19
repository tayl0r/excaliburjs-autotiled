# Autotile JSON Metadata Schema

> The file format shared between the Tile Metadata Editor and the Autotile Engine.
> The editor produces these files; the engine consumes them.
>
> Related documents:
> - [Autotile Engine Spec](./AUTOTILE_ENGINE_SPEC.md) — algorithm and data model
> - [Tile Metadata Editor Spec](./TILE_METADATA_EDITOR_SPEC.md) — the tool that creates these files
> - [TimeFantasy Asset Guide](./TIMEFANTASY_ASSET_GUIDE.md) — applying this to the TimeFantasy assets

---

## 1. Per-Tileset Metadata File

One JSON file per tileset spritesheet. Compatible with the Tiled map editor's format.

### 1.1 Full Schema

```json
{
  "tilesetImage": "terrain.png",
  "tileWidth": 16,
  "tileHeight": 16,
  "columns": 16,
  "tileCount": 256,
  "transformations": {
    "allowRotate": true,
    "allowFlipH": true,
    "allowFlipV": true,
    "preferUntransformed": true
  },
  "wangsets": [
    {
      "name": "Ground Terrain",
      "type": "corner",
      "tile": 0,
      "colors": [
        {
          "name": "Grass",
          "color": "#00ff00",
          "probability": 1.0,
          "tile": 0
        },
        {
          "name": "Dirt",
          "color": "#8b4513",
          "probability": 1.0,
          "tile": 17
        }
      ],
      "wangtiles": [
        {
          "tileid": 0,
          "wangid": [0, 1, 0, 1, 0, 1, 0, 1]
        },
        {
          "tileid": 1,
          "wangid": [0, 2, 0, 1, 0, 1, 0, 1]
        },
        {
          "tileid": 2,
          "wangid": [0, 1, 0, 2, 0, 1, 0, 1]
        }
      ]
    }
  ],
  "animations": [
    {
      "name": "Water",
      "frameCount": 3,
      "frameDuration": 200,
      "pattern": "ping-pong",
      "frames": [
        { "tileIdOffset": 0, "description": "Frame 1" },
        { "tileIdOffset": 48, "description": "Frame 2" },
        { "tileIdOffset": 96, "description": "Frame 3" }
      ]
    }
  ]
}
```

### 1.2 Field Reference

#### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tilesetImage` | string | yes | Relative path to the spritesheet PNG |
| `tileWidth` | int | yes | Tile width in pixels |
| `tileHeight` | int | yes | Tile height in pixels |
| `columns` | int | yes | Number of tile columns in the spritesheet |
| `tileCount` | int | yes | Total number of tiles in the spritesheet |
| `transformations` | object | no | Allowed tile transformations (see below) |
| `wangsets` | array | yes | List of WangSet definitions |
| `animations` | array | no | List of animation sequence definitions |

#### Transformations Object

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `allowRotate` | bool | false | Allow 90/180/270 degree rotations |
| `allowFlipH` | bool | false | Allow horizontal flipping |
| `allowFlipV` | bool | false | Allow vertical flipping |
| `preferUntransformed` | bool | true | Add penalty for transformed variants |

#### WangSet Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Human-readable name |
| `type` | string | yes | `"corner"`, `"edge"`, or `"mixed"` |
| `tile` | int | no | Tile ID used as set icon (-1 = none) |
| `colors` | array | yes | List of WangColor definitions |
| `wangtiles` | array | yes | List of tile-to-WangId mappings |

#### WangColor Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Terrain type name (e.g., "Grass") |
| `color` | string | yes | Hex color for editor overlay (e.g., "#00ff00") |
| `probability` | float | no | Weight for random selection (default 1.0) |
| `tile` | int | no | Tile ID used as color icon (-1 = none) |

#### WangTile Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tileid` | int | yes | Tile ID in the tileset (0-based) |
| `wangid` | int[8] | yes | The 8 color indices (see WangId Array Order below) |

#### Animation Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Animation name (e.g., "Water") |
| `frameCount` | int | yes | Number of animation frames |
| `frameDuration` | int | yes | Duration per frame in milliseconds |
| `pattern` | string | no | `"loop"` (default) or `"ping-pong"` |
| `frames` | array | yes | Frame definitions with tile ID offsets |

#### Animation Frame Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tileIdOffset` | int | yes | Add this to the base tile ID to get the frame's tile |
| `description` | string | no | Human-readable label |

---

## 2. WangId Array Order

The `wangid` array is always 8 elements, clockwise starting from Top:

```
Index:  [  0,     1,        2,     3,           4,      5,          6,    7      ]
Name:   [Top, TopRight, Right, BottomRight, Bottom, BottomLeft, Left, TopLeft]
Type:   [Edge, Corner,  Edge,  Corner,      Edge,   Corner,     Edge, Corner ]
```

- For **corner-only** sets (`"type": "corner"`): indices 0, 2, 4, 6 should all be `0`.
- For **edge-only** sets (`"type": "edge"`): indices 1, 3, 5, 7 should all be `0`.
- For **mixed** sets (`"type": "mixed"`): all 8 indices may be non-zero.

**Color values:**
- `0` = wildcard / unassigned (matches anything)
- `1..254` = valid terrain color index (1-based, matching position in the `colors` array)

---

## 3. Project File

Optional file that groups multiple tileset metadata files into a project.

```json
{
  "projectName": "TimeFantasy RPG",
  "defaultTileSize": [16, 16],
  "tilesets": [
    { "image": "terrain.png", "metadata": "terrain.autotile.json" },
    { "image": "outside.png", "metadata": "outside.autotile.json" },
    { "image": "water.png", "metadata": "water.autotile.json" },
    { "image": "desert.png", "metadata": "desert.autotile.json" },
    { "image": "dungeon.png", "metadata": "dungeon.autotile.json" },
    { "image": "castle.png", "metadata": "castle.autotile.json" }
  ]
}
```

---

## 4. Tile ID Calculation

Tile IDs are assigned left-to-right, top-to-bottom, zero-indexed:

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

## 5. Validation Rules

A valid metadata file must satisfy:

1. **All `wangid` arrays are exactly 8 elements**
2. **All color indices in `wangid` are 0 or reference a valid color** (1 to len(colors))
3. **For corner-type sets**: indices 0, 2, 4, 6 must be 0
4. **For edge-type sets**: indices 1, 3, 5, 7 must be 0
5. **All `tileid` values are in range** [0, tileCount)
6. **No duplicate `tileid` within a single WangSet** (one WangId per tile per set)
7. **At least one color defined per WangSet**
8. **Color probabilities are > 0**
