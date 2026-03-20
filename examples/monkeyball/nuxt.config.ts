// https://nuxt.com/docs/api/configuration/nuxt-config
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Pre-build the WebMonkeyBall game with esbuild before Vite resolves imports.
// esbuild handles the circular dependencies in noclip/ that Rollup cannot
// resolve when inlineDynamicImports is enabled.
const __dirname = dirname(fileURLToPath(import.meta.url));
const gameOutput = resolve(__dirname, 'game/main.js');
if (!existsSync(gameOutput)) {
  console.log('[monkeyball] Building game with esbuild...');
  execSync('node build-game.mjs', { cwd: __dirname, stdio: 'inherit' });
}

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false },

  extends: ['../shared'],

  ssr: false,

  nitro: {
    preset: 'static',
    output: {
      publicDir: '.output/public'
    }
  },

  app: {
    head: {
      title: 'Super Monkey Ball',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Super Monkey Ball web game powered by WebMonkeyBall' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black' },
        { name: 'theme-color', content: '#000000' }
      ]
    },
    baseURL: '/'
  },

  router: {
    options: {
      hashMode: true
    }
  },

  experimental: {
    appManifest: false
  },

  vite: {
    build: {
      minify: true,
      sourcemap: false,
      target: 'esnext',
      assetsInlineLimit: 100 * 1024,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          manualChunks: undefined,
        },
      },
    },
  },

  css: [],
})
