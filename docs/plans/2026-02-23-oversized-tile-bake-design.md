# Oversized Tile Bake Support

## Problem

The bake pipeline hardcodes `TILE_SIZE = 16` for all tile extraction. Monster tilesets (monster1-4.png) have 60x64 pixel tiles, but the pipeline reads 16x16 sub-tiles from them using incorrect column calculations. This produces garbled output for any tileset with non-16x16 tiles.

## Solution

Oversized tiles get contiguous blocks in the baked atlas. A 60x64 tile occupies a 64x64 (4x4 of 16px) slot. The generated metadata includes an `oversizeTiles` table so consumers know the actual source rect and render offsets.

## Design

### TileRegistry

`register()` accepts `tilesetDefs` to look up per-tileset `tileWidth`/`tileHeight`. Each `TileEntry` gains `sourceWidth` and `sourceHeight` fields.

### Atlas Packing

1. Normal tiles (16x16) are packed sequentially as before — `bakedId - 1` maps to atlas grid position.
2. Oversized tiles are packed after normal tiles in aligned blocks. Each 60x64 tile gets a `ceil(60/16) x ceil(64/16)` = 4x4 block of 16px cells.
3. The atlas layout accounts for both normal slot count and oversized block slots when computing the power-of-2 atlas size.

### buildAtlas Changes

- Read source tiles at their native `tileWidth x tileHeight` from the source tileset (using tileset metadata columns, not `src.width / 16`).
- Write oversized tiles into their allocated atlas blocks.
- Normal tiles use the existing per-pixel copy with flip transforms.
- Oversized tiles use the same flip logic but iterate over the full `sourceWidth x sourceHeight`.

### Generated Index

```typescript
export const atlas = {
  version: 2,
  tileWidth: 16,
  tileHeight: 16,
  files: [...],
  columns: 64,
  tileCount: 150,
  tilesPerFile: 4096,
  oversizeTiles: {
    42: {
      atlasX: 512,
      atlasY: 768,
      sourceWidth: 60,
      sourceHeight: 64,
      renderOffsetX: -22,
      renderOffsetY: -48,
    },
  },
};
```

Consumer checks `oversizeTiles[bakedId]` first. If present, creates a sprite from that rect with render offsets. Otherwise uses standard `(bakedId-1) % columns` formula.

### Render Offsets (Bottom-Center Anchor)

For a tile of size `(w, h)` placed on a 16x16 grid cell:
- `renderOffsetX = -(w - 16) / 2` — centers horizontally on the cell
- `renderOffsetY = -(h - 16)` — anchors bottom edge to cell bottom

For 60x64: offsetX = -22, offsetY = -48.

### Prefab Update

The slime prefab (`assets/prefabs/slime.json`) is simplified from 12 tile entries to 1 entry referencing a single 60x64 monster tile.

## Files Changed

| File | Change |
|------|--------|
| `scripts/bake-lib.ts` | TileRegistry size awareness, buildAtlas oversized block packing, generateIndex oversizeTiles output |
| `assets/prefabs/slime.json` | Simplified to single tile entry |
| `docs/DATA_MODEL.md` | Document oversized tile metadata |
| `docs/CHANGELOG.md` | Log the feature |
