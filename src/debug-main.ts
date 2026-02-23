import type { ProjectMetadata } from './core/metadata-schema.js';
import { DebugUI } from './debug/debug-ui.js';

const resp = await fetch('/assets/project.autotile.json');
const metadata: ProjectMetadata = await resp.json();

const prefabResp = await fetch('/api/list-prefabs');
const prefabList: { files: string[] } = await prefabResp.json();

const prefabs: Array<{ name: string; data: Record<string, unknown> }> = [];
for (const file of prefabList.files) {
  const r = await fetch(`/assets/prefabs/${file}`);
  prefabs.push({ name: file.replace('.json', ''), data: await r.json() });
}

const app = document.getElementById('app')!;
new DebugUI(app, metadata, prefabs);
