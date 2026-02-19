import type { ProjectMetadata } from './core/metadata-schema.js';
import { type SavedPrefab, type SavedPrefabV1, parseSavedPrefab } from './core/prefab-schema.js';
import { PrefabEditorState } from './prefab/prefab-state.js';
import { PrefabEditor } from './prefab/prefab-editor.js';
import { loadTilesetImage } from './utils/asset-paths.js';

const resp = await fetch('/assets/project.autotile.json');
const projectMetadata: ProjectMetadata = await resp.json();

const images = await Promise.all(projectMetadata.tilesets.map(loadTilesetImage));

const listResp = await fetch('/api/list-prefabs');
const { files } = (await listResp.json()) as { files: string[] };

const prefabPromises = files.map(async (filename) => {
  const r = await fetch(`/assets/prefabs/${filename}`);
  const raw = (await r.json()) as SavedPrefabV1 | SavedPrefab;
  return parseSavedPrefab(raw);
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
const hashLayer = hashParams.get('layer');
if (hashLayer) {
  const layerNum = parseInt(hashLayer, 10);
  if (layerNum >= 1 && layerNum <= 5) {
    state.setActiveLayer(layerNum - 1);
  }
}

function updateHash(): void {
  const parts: string[] = [];
  const name = state.activePrefabName;
  if (name) parts.push(`prefab=${encodeURIComponent(name)}`);
  const ts = state.activeTileset;
  if (ts) parts.push(`tileset=${encodeURIComponent(ts.tilesetImage.replace(/\.\w+$/, ''))}`);
  if (state.activeLayer > 0) parts.push(`layer=${state.activeLayer + 1}`);
  history.replaceState(null, '', `#${parts.join('&')}`);
}
state.on('activePrefabChanged', updateHash);
state.on('activeTilesetChanged', updateHash);
state.on('activeLayerChanged', updateHash);
updateHash();

new PrefabEditor(state, images);
