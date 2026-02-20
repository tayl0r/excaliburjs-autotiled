import type { ProjectMetadata } from './core/metadata-schema.js';

const resp = await fetch('/assets/project.autotile.json');
const metadata: ProjectMetadata = await resp.json();

console.log('[map-generator] Loaded metadata:', metadata.wangsets.length, 'wangsets');

const app = document.getElementById('app')!;
app.style.cssText = 'color: #ccc; padding: 20px; font-family: system-ui;';
app.textContent = `Map Generator — ${metadata.wangsets[0].colors.length} colors available`;
