import type { ProjectMetadata } from './core/metadata-schema.js';
import { TileEditor } from './editor/tile-editor.js';

const resp = await fetch('/assets/metadata/project.autotile.json');
const projectMetadata: ProjectMetadata = await resp.json();

const imagePromises = projectMetadata.tilesets.map(
  (ts) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `/assets/TimeFantasy_TILES_6.24.17/TILESETS/${ts.tilesetImage}`;
    }),
);

const images = await Promise.all(imagePromises);
const editor = new TileEditor(projectMetadata, images);

document.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9') {
    editor.setActiveColor(Number(e.key));
  }
});
