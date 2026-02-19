# Autotile Implementation Guide — Index

> This guide has been split into focused documents for easier handoff to implementation teams.

## Documents

| Document | Purpose |
|----------|---------|
| [Autotile Engine Spec](./AUTOTILE_ENGINE_SPEC.md) | Data model, WangId encoding, matching algorithm, transformation system, penalty scoring, runtime integration. **Start here for understanding how autotiling works.** |
| [Tile Metadata Editor Spec](./TILE_METADATA_EDITOR_SPEC.md) | Standalone asset pipeline tool for tagging tiles with WangIds. UI layout, workflow, tagging methods, validation, animation support. **Start here for building the editor.** |
| [JSON Schema](./AUTOTILE_JSON_SCHEMA.md) | The metadata file format shared between the editor and the engine. Field reference, validation rules, examples. |
| [TimeFantasy Asset Guide](./TIMEFANTASY_ASSET_GUIDE.md) | How to apply all of the above to the specific TimeFantasy 16x16 tile assets. Which WangSets to create, water animation setup, cliff handling. |

## Reading Order

1. **Engine Spec** — understand the data model and algorithm first
2. **JSON Schema** — understand what metadata the system needs
3. **Editor Spec** — understand the tool that creates that metadata
4. **Asset Guide** — apply it to the actual TimeFantasy tiles
