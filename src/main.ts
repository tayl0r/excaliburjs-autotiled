import * as ex from 'excalibur';
import { TilesetManager } from './engine/tileset-manager.js';
import { GameScene } from './engine/game-scene.js';
import { TileEditor } from './editor/tile-editor.js';
import { ProjectMetadata } from './core/metadata-schema.js';

async function loadMetadata(): Promise<ProjectMetadata> {
  const resp = await fetch('/assets/metadata/project.autotile.json');
  return resp.json();
}

const projectMetadata = await loadMetadata();

const tilesetImages = projectMetadata.tilesets.map(
  ts => new ex.ImageSource(`/assets/TimeFantasy_TILES_6.24.17/TILESETS/${ts.tilesetImage}`)
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
game.start('game', { loader }).then(() => {
  console.log('[metadata] Loaded project metadata:', JSON.parse(JSON.stringify(projectMetadata)));

  const images = tilesetImages.map(src => src.image);
  const editor = new TileEditor(projectMetadata, images);

  editor.onHide(() => {
    gameScene.reloadMetadata(editor.getMetadata());
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 't' || e.key === 'T') {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        editor.toggle();
      }
    } else if (e.key === 'Escape') {
      editor.hide();
    } else if (e.key >= '0' && e.key <= '9' && editor.isActive) {
      editor.setActiveColor(Number(e.key));
    }
  });
});
