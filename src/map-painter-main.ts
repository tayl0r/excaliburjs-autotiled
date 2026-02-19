import * as ex from 'excalibur';
import type { ProjectMetadata } from './core/metadata-schema.js';
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

  const hash = window.location.hash;
  const mapMatch = hash.match(/^#map=(.+)$/);
  if (mapMatch) {
    const mapName = decodeURIComponent(mapMatch[1]);
    try {
      await gameScene.loadMapByName(mapName);
    } catch (err) {
      console.warn(`[map-painter] Failed to load map "${mapName}" from URL:`, err);
    }
  }
});
