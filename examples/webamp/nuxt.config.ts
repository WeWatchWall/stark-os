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
      title: 'Webamp',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Music player powered by Webamp with OPFS integration' }
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
