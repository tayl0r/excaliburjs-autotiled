import * as ex from 'excalibur';
import { TilesetManager } from './engine/tileset-manager.js';
import { GameScene } from './engine/game-scene.js';
import { TileEditor } from './editor/tile-editor.js';
import terrainMetadata from '../assets/metadata/terrain.autotile.json';
import { TilesetMetadata } from './core/metadata-schema.js';

// Load terrain image
const terrainImage = new ex.ImageSource('/assets/TimeFantasy_TILES_6.24.17/TILESETS/terrain.png');

// Create tileset manager
const tilesetManager = new TilesetManager(
  terrainImage,
  terrainMetadata as TilesetMetadata
);

// Create the game scene, passing the tileset manager
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

const loader = new ex.Loader([terrainImage]);
loader.suppressPlayButton = true;

game.addScene('game', gameScene);
game.start('game', { loader }).then(() => {
  // Initialize tile editor after resources are loaded
  const editor = new TileEditor(
    terrainMetadata as TilesetMetadata,
    terrainImage.image
  );

  // Toggle editor with 'T' key or Escape to close
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
