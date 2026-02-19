import type { ProjectMetadata } from './core/metadata-schema.js';
import type { SavedPrefab } from './core/prefab-schema.js';
import { PrefabEditorState } from './prefab/prefab-state.js';
import { PrefabEditor } from './prefab/prefab-editor.js';

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

// Load existing prefabs
const listResp = await fetch('/api/list-prefabs');
const { files } = (await listResp.json()) as { files: string[] };

const prefabPromises = files.map(async (filename) => {
  const r = await fetch(`/assets/metadata/prefabs/${filename}`);
  return (await r.json()) as SavedPrefab;
});
const prefabs = await Promise.all(prefabPromises);

const state = new PrefabEditorState(projectMetadata);
state.loadPrefabs(prefabs);

// Restore state from URL hash (e.g. #prefab=house&tileset=castle)
const hashParams = new URLSearchParams(window.location.hash.slice(1));
const hashPrefab = hashParams.get('prefab');
if (hashPrefab && state.prefabs.has(hashPrefab)) {
  state.setActivePrefab(hashPrefab);
}
const hashTileset = hashParams.get('tileset');
if (hashTileset) {
  const idx = projectMetadata.tilesets.findIndex(
    ts => ts.tilesetImage.replace(/\.\w+$/, '') === hashTileset,
  );
  if (idx >= 0) state.setActiveTileset(idx);
}

// Update URL hash when prefab or tileset changes
function updateHash(): void {
  const parts: string[] = [];
  const name = state.activePrefabName;
  if (name) parts.push(`prefab=${encodeURIComponent(name)}`);
  const ts = state.activeTileset;
  if (ts) parts.push(`tileset=${encodeURIComponent(ts.tilesetImage.replace(/\.\w+$/, ''))}`);
  history.replaceState(null, '', `#${parts.join('&')}`);
}
state.on('activePrefabChanged', updateHash);
state.on('activeTilesetChanged', updateHash);
updateHash();

new PrefabEditor(state, images);
