// https://nuxt.com/docs/api/configuration/nuxt-config
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
      title: 'Notepad',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Lightweight text editor with OPFS persistence' }
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
    resolve: {
      alias: {
        // isomorphic-git references the Node.js `buffer` built-in, which Vite
        // externalizes by default.  Point it at the npm `buffer` polyfill so
        // `Buffer` is available in the browser.
        buffer: 'buffer/',
      },
    },
    optimizeDeps: {
      include: ['buffer'],
    },
  },

  css: [],
})
