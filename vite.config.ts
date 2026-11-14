import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function lanApiPlugin() {
  return {
    name: 'lan-api-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith('/api/lan')) {
          const { handleLanApi } = await import('./server/lanHandler.ts');
          const handled = await handleLanApi(req, res);
          if (handled) return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => {
  return {
    base: command === 'build' ? './' : '/',
    plugins: [react(), tailwindcss(), lanApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
