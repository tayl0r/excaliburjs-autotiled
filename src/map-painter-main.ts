import * as ex from 'excalibur';
import type { ProjectMetadata } from './core/metadata-schema.js';
import { parseSavedPrefab } from './core/prefab-schema.js';
import { TilesetManager } from './engine/tileset-manager.js';
import { GameScene } from './engine/game-scene.js';
import { tilesetImageUrl } from './utils/asset-paths.js';

const resp = await fetch('/assets/project.autotile.json');
const projectMetadata: ProjectMetadata = await resp.json();

const tilesetImages = projectMetadata.tilesets.map(
  (ts) => new ex.ImageSource(tilesetImageUrl(ts)),
);

const tilesetManager = new TilesetManager(tilesetImages, projectMetadata);
const gameScene = new GameScene(tilesetManager);

const game = new ex.Engine({
  width: 960,
  height: 960,
  fixedUpdateFps: 60,
  pixelArt: true,
  pixelRatio: 1,
  backgroundColor: ex.Color.fromHex('#1a1a2e'),
  antialiasing: false,
});

const loader = new ex.Loader(tilesetImages);
loader.suppressPlayButton = true;

game.addScene('game', gameScene);
game.start('game', { loader }).then(async () => {
  console.log('[map-painter] Loaded project metadata:', JSON.parse(JSON.stringify(projectMetadata)));

  // Load prefabs
  try {
    const prefabListResp = await fetch('/api/list-prefabs');
    const { files: prefabFiles } = (await prefabListResp.json()) as { files: string[] };
    const prefabs = await Promise.all(
      prefabFiles.map(async (f) => parseSavedPrefab(await (await fetch(`/assets/prefabs/${f}`)).json())),
    );
    gameScene.setPrefabs(prefabs);
    console.log(`[map-painter] Loaded ${prefabs.length} prefabs`);
  } catch (err) {
    console.warn('[map-painter] Failed to load prefabs:', err);
  }

  const hashParams = new URLSearchParams(window.location.hash.slice(1));

  const mapName = hashParams.get('map');
  if (mapName) {
    try {
      await gameScene.loadMapByName(decodeURIComponent(mapName));
    } catch (err) {
      console.warn(`[map-painter] Failed to load map "${mapName}" from URL:`, err);
    }
  }

  const layerParam = hashParams.get('layer');
  if (layerParam) {
    const layerNum = parseInt(layerParam, 10);
    if (layerNum >= 1 && layerNum <= 5) {
      gameScene.setActiveLayer(layerNum - 1);
    }
  }
});
