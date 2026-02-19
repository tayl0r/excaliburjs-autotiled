import type { ProjectMetadata } from './core/metadata-schema.js';
import { TileEditor } from './editor/tile-editor.js';
import { loadTilesetImage } from './utils/asset-paths.js';

const resp = await fetch('/assets/project.autotile.json');
const projectMetadata: ProjectMetadata = await resp.json();

const images = await Promise.all(projectMetadata.tilesets.map(loadTilesetImage));
const editor = new TileEditor(projectMetadata, images);

document.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9') {
    editor.setActiveColor(Number(e.key));
  }
});
