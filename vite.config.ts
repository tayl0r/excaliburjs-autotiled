import { defineConfig, Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import fs from 'fs';

const ASSETS_DIR = path.resolve(__dirname, 'assets');

function sanitizeJsonFilename(filename: string): string | null {
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '');
  return safeName.endsWith('.json') ? safeName : null;
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (err) { reject(err); }
    });
  });
}

function jsonResponse(res: ServerResponse, data: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json'));
}

function writeJsonFile(dir: string, safeName: string, data: unknown): { outPath: string; json: string } {
  ensureDir(dir);
  const outPath = path.resolve(dir, safeName);
  const json = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(outPath, json, 'utf-8');
  return { outPath, json };
}

function metadataSavePlugin(): Plugin {
  return {
    name: 'metadata-save',
    configureServer(server) {
      server.middlewares.use('/api/save-metadata', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return; }

        try {
          const { filename, data } = await readJsonBody(req);
          if (!filename || !data) { res.statusCode = 400; res.end('Missing filename or data'); return; }

          const safeName = sanitizeJsonFilename(filename as string);
          if (!safeName) { res.statusCode = 400; res.end('Filename must end with .json'); return; }

          const { outPath, json } = writeJsonFile(path.resolve(ASSETS_DIR, 'metadata'), safeName, data);

          const wangsets = (data as Record<string, unknown[]>).wangsets ?? [];
          const totalTiles = wangsets.reduce((sum: number, ws: Record<string, unknown[]>) => sum + (ws.wangtiles?.length ?? 0), 0);
          const totalColors = wangsets.reduce((sum: number, ws: Record<string, unknown[]>) => sum + (ws.colors?.length ?? 0), 0);
          const wsDetails = wangsets.map((ws: Record<string, unknown>) =>
            `  "${ws.name}" (${ws.type}): ${(ws.colors as unknown[])?.length ?? 0} colors, ${(ws.wangtiles as unknown[])?.length ?? 0} tiles`
          ).join('\n');

          console.log(
            `\n[metadata-save] ✓ Saved ${safeName}\n` +
            `  Path: ${outPath}\n` +
            `  Size: ${json.length} bytes\n` +
            `  WangSets: ${wangsets.length} (${totalColors} colors, ${totalTiles} tagged tiles)\n` +
            (wsDetails ? wsDetails + '\n' : '')
          );
          jsonResponse(res, { ok: true, path: outPath });
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
  };
}

function mapSavePlugin(): Plugin {
  const mapsDir = path.resolve(ASSETS_DIR, 'maps');

  return {
    name: 'map-save',
    configureServer(server) {
      server.middlewares.use('/api/save-map', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return; }

        try {
          const { filename, data } = await readJsonBody(req);
          if (!filename || !data) { res.statusCode = 400; res.end('Missing filename or data'); return; }

          const safeName = sanitizeJsonFilename(filename as string);
          if (!safeName) { res.statusCode = 400; res.end('Filename must end with .json'); return; }

          const { outPath, json } = writeJsonFile(mapsDir, safeName, data);
          console.log(`\n[map-save] Saved ${safeName} (${json.length} bytes) to ${outPath}`);
          jsonResponse(res, { ok: true, path: outPath });
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });

      server.middlewares.use('/api/list-maps', (_req, res) => {
        try {
          jsonResponse(res, { files: listJsonFiles(mapsDir) });
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
  };
}

function prefabSavePlugin(): Plugin {
  const prefabsDir = path.resolve(ASSETS_DIR, 'metadata/prefabs');

  return {
    name: 'prefab-save',
    configureServer(server) {
      server.middlewares.use('/api/save-prefab', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return; }

        try {
          const { filename, data } = await readJsonBody(req);
          if (!filename || !data) { res.statusCode = 400; res.end('Missing filename or data'); return; }

          const safeName = sanitizeJsonFilename(filename as string);
          if (!safeName) { res.statusCode = 400; res.end('Filename must end with .json'); return; }

          const { outPath, json } = writeJsonFile(prefabsDir, safeName, data);
          console.log(`\n[prefab-save] Saved ${safeName} (${json.length} bytes) to ${outPath}`);
          jsonResponse(res, { ok: true, path: outPath });
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });

      server.middlewares.use('/api/list-prefabs', (_req, res) => {
        try {
          jsonResponse(res, { files: listJsonFiles(prefabsDir) });
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });

      server.middlewares.use('/api/delete-prefab', async (req, res) => {
        if (req.method !== 'DELETE' && req.method !== 'POST') {
          res.statusCode = 405; res.end('Method not allowed'); return;
        }

        try {
          const { filename } = await readJsonBody(req);
          if (!filename) { res.statusCode = 400; res.end('Missing filename'); return; }

          const safeName = sanitizeJsonFilename(filename as string);
          if (!safeName) { res.statusCode = 400; res.end('Filename must end with .json'); return; }

          const filePath = path.resolve(prefabsDir, safeName);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`\n[prefab-save] Deleted ${safeName}`);
          }

          jsonResponse(res, { ok: true });
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [metadataSavePlugin(), mapSavePlugin(), prefabSavePlugin()],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        'tileset-editor': path.resolve(__dirname, 'tools/tileset-editor/index.html'),
        'map-painter': path.resolve(__dirname, 'tools/map-painter/index.html'),
        'prefab-editor': path.resolve(__dirname, 'tools/prefab-editor/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@editor': path.resolve(__dirname, 'src/editor'),
      '@utils': path.resolve(__dirname, 'src/utils'),
    },
  },
  assetsInclude: ['**/*.png'],
  server: {
    port: 5200,
    watch: {
      ignored: ['**/assets/metadata/**', '**/assets/maps/**'],
    },
  },
  preview: {
    port: 5201,
  },
});
