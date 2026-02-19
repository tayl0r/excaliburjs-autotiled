# Map Generator Tool — Design

## Overview

A standalone page at `/tools/map-generator/` for procedural terrain map generation. Users pick biome colors + ratios, choose an algorithm (noise or voronoi), set dimensions and a seed, then click Generate. The result renders as a color-grid preview and saves as a standard map file for the map painter.

## Core Generation Algorithms

### Noise-based (organic blobs)
- Simplex/Perlin noise sampled per cell, thresholded into biome zones based on cumulative ratios
- Multiple octaves for natural variation
- Produces irregular, natural-looking coastlines and borders

### Voronoi-based (cell regions)
- Scatter seed points proportional to biome ratios
- Each cell assigned to nearest seed point's biome
- Produces cleaner, more distinct regional shapes
- Optional jitter/relaxation for more even distribution

## Biome Configuration

- List of checkboxes from the WangSet's colors (Grass, Dirt, Sand, Water, etc.)
- Slider or number input per enabled biome for relative weight (e.g. Grass 60%, Sand 25%, Water 15%)
- Weights auto-normalize to 100%

## Generation Settings

- **Algorithm**: Noise / Voronoi toggle
- **Map size**: Width x Height (default 64x64)
- **Seed**: Numeric seed for reproducibility (randomize button)
- **Scale** (noise only): Controls biome region size (small = many small patches, large = few big regions)
- **Point count** (voronoi only): Number of seed points

## Transition Handling

After the base color grid is generated, run the existing `insertIntermediates()` from `terrain-painter.ts` to smooth borders. This auto-inserts transition colors (e.g. Grass->Dirt->Sand) wherever biomes meet with distance > 1.

## Preview & Output

- Canvas renders the generated color grid using each biome's hex display color (no tile resolution — fast)
- "Generate" button runs the algorithm with current settings
- "Save" button writes to `assets/maps/<name>.json` via the existing Vite API endpoint
- Standard SavedMap v2 format — colors go into layer 0, other layers empty

## Page Structure

- Left panel: settings (algorithm, biomes, dimensions, seed)
- Right side: color-grid canvas preview
- Bottom bar: name input + Save button

## Architecture

| File | Purpose |
|------|---------|
| `src/core/map-generator.ts` | Pure generation logic (noise + voronoi). Takes biome config + settings, returns flat color array. No DOM deps. |
| `src/map-generator-main.ts` | Entry point, wires up the UI page |
| `src/generator/` | UI components (settings panel, preview canvas, save flow) |

Reuses:
- `src/core/terrain-painter.ts` — `insertIntermediates()` for transition smoothing
- `src/core/map-schema.ts` — SavedMap v2 format for saving
- `assets/project.autotile.json` — WangSet color definitions for biome list
