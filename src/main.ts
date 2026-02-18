import * as ex from 'excalibur';
import { TilesetManager } from './engine/tileset-manager.js';
import { GameScene } from './engine/game-scene.js';
import { TileEditor } from './editor/tile-editor.js';
import { migrateToProjectMetadata } from './core/metadata-migration.js';

// Fetch metadata at runtime so we always get the latest saved version
// Try project.autotile.json first, fall back to legacy terrain.autotile.json
async function loadMetadata() {
  const projectResp = await fetch('/assets/metadata/project.autotile.json');
  if (projectResp.ok) {
    const raw = await projectResp.json();
    return migrateToProjectMetadata(raw);
  }
  const legacyResp = await fetch('/assets/metadata/terrain.autotile.json');
  const raw = await legacyResp.json();
  return migrateToProjectMetadata(raw);
}

const projectMetadata = await loadMetadata();

// Create ImageSource for each tileset defined in the project metadata
const tilesetImages = projectMetadata.tilesets.map(
  ts => new ex.ImageSource(`/assets/TimeFantasy_TILES_6.24.17/TILESETS/${ts.tilesetImage}`)
);

// Create tileset manager with all tileset images
const tilesetManager = new TilesetManager(
  tilesetImages,
  projectMetadata
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

// Load all tileset images
const loader = new ex.Loader(tilesetImages);
loader.suppressPlayButton = true;

game.addScene('game', gameScene);
game.start('game', { loader }).then(() => {
  console.log('[metadata] Loaded project metadata:', JSON.parse(JSON.stringify(projectMetadata)));

  // Get HTMLImageElement for each loaded tileset
  const images = tilesetImages.map(src => src.image);

  // Initialize tile editor with all tileset images
  const editor = new TileEditor(
    projectMetadata,
    images
  );

  // Reload game scene when editor closes
  editor.onHide(() => {
    gameScene.reloadMetadata(editor.getMetadata());
  });

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
