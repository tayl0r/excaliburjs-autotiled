import { defineConfig, Plugin } from 'vite';
import path from 'path';
import fs from 'fs';

/** Vite plugin that adds a dev-server endpoint for saving tile metadata JSON. */
function metadataSavePlugin(): Plugin {
  return {
    name: 'metadata-save',
    configureServer(server) {
      server.middlewares.use('/api/save-metadata', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { filename, data } = JSON.parse(body);
            if (!filename || !data) {
              res.statusCode = 400;
              res.end('Missing filename or data');
              return;
            }

            // Sanitize filename: only allow alphanumeric, dots, hyphens, underscores
            const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '');
            if (!safeName.endsWith('.json')) {
              res.statusCode = 400;
              res.end('Filename must end with .json');
              return;
            }

            const outPath = path.resolve(__dirname, 'assets/metadata', safeName);
            const json = JSON.stringify(data, null, 2) + '\n';
            fs.writeFileSync(outPath, json, 'utf-8');

            const wangsets = data.wangsets ?? [];
            const totalTiles = wangsets.reduce((sum: number, ws: { wangtiles?: unknown[] }) => sum + (ws.wangtiles?.length ?? 0), 0);
            const totalColors = wangsets.reduce((sum: number, ws: { colors?: unknown[] }) => sum + (ws.colors?.length ?? 0), 0);
            const wsDetails = wangsets.map((ws: { name: string; type: string; wangtiles?: unknown[]; colors?: unknown[] }) =>
              `  "${ws.name}" (${ws.type}): ${ws.colors?.length ?? 0} colors, ${ws.wangtiles?.length ?? 0} tiles`
            ).join('\n');

            console.log(
              `\n[metadata-save] ✓ Saved ${safeName}\n` +
              `  Path: ${outPath}\n` +
              `  Size: ${json.length} bytes\n` +
              `  WangSets: ${wangsets.length} (${totalColors} colors, ${totalTiles} tagged tiles)\n` +
              (wsDetails ? wsDetails + '\n' : '')
            );
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: outPath }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [metadataSavePlugin()],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        'tileset-editor': path.resolve(__dirname, 'tools/tileset-editor/index.html'),
        'map-painter': path.resolve(__dirname, 'tools/map-painter/index.html'),
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
      ignored: ['**/assets/metadata/**'],
    },
  },
  preview: {
    port: 5201,
  },
});
