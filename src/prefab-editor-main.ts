import type { ProjectMetadata } from './core/metadata-schema.js';
import type { SavedPrefab } from './core/prefab-schema.js';
import { PrefabEditorState } from './prefab/prefab-state.js';
import { PrefabEditor } from './prefab/prefab-editor.js';
import { loadTilesetImage } from './utils/asset-paths.js';

const resp = await fetch('/assets/metadata/project.autotile.json');
const projectMetadata: ProjectMetadata = await resp.json();

const images = await Promise.all(projectMetadata.tilesets.map(loadTilesetImage));

const listResp = await fetch('/api/list-prefabs');
const { files } = (await listResp.json()) as { files: string[] };

const prefabPromises = files.map(async (filename) => {
  const r = await fetch(`/assets/metadata/prefabs/${filename}`);
  return (await r.json()) as SavedPrefab;
});
const prefabs = await Promise.all(prefabPromises);

const state = new PrefabEditorState(projectMetadata);
state.loadPrefabs(prefabs);

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
