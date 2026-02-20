import type { ProjectMetadata } from './core/metadata-schema.js';
import { GeneratorUI } from './generator/generator-ui.js';

const resp = await fetch('/assets/project.autotile.json');
const metadata: ProjectMetadata = await resp.json();

const app = document.getElementById('app')!;
new GeneratorUI(app, metadata);
