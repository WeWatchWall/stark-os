import Aura from '@primevue/themes/aura';
import { definePreset } from '@primevue/themes';

/**
 * Custom PrimeVue preset that matches the Stark OS dark theme.
 * Base colors: background #1e1e1e, text #e2e8f0, accent #3b82f6.
 */
const StarkPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{blue.50}',
      100: '{blue.100}',
      200: '{blue.200}',
      300: '{blue.300}',
      400: '{blue.400}',
      500: '{blue.500}',
      600: '{blue.600}',
      700: '{blue.700}',
      800: '{blue.800}',
      900: '{blue.900}',
      950: '{blue.950}',
    },
    colorScheme: {
      dark: {
        surface: {
          0: '#ffffff',
          50: '#e2e8f0',
          100: '#cbd5e1',
          200: '#94a3b8',
          300: '#64748b',
          400: '#475569',
          500: '#334155',
          600: '#1e293b',
          700: '#1e1e1e',
          800: '#181818',
          900: '#121212',
          950: '#0a0a0a',
        },
      },
    },
  },
});

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false },

  // Generate static files for production
  ssr: false,

  // PrimeVue Nuxt module
  modules: ['@primevue/nuxt-module'],

  primevue: {
    options: {
      theme: {
        preset: StarkPreset,
        options: {
          darkModeSelector: ':root',
        },
      },
    },
    components: {
      include: ['DataTable', 'Column', 'Button', 'Tag', 'ProgressSpinner', 'ProgressBar', 'Card', 'Knob', 'Tabs', 'TabList', 'Tab', 'TabPanels', 'TabPanel', 'Toast', 'Chart'],
    },
  },

  // Output directory for the static build
  nitro: {
    preset: 'static',
    output: {
      publicDir: '.output/public'
    }
  },

  app: {
    head: {
      title: 'Stark OS Status',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Task manager for Stark OS — pods and resources' }
      ]
    },
    // Use base of '/' for iframe compatibility
    baseURL: '/'
  },

  // Use hash-based routing for iframe/srcdoc compatibility
  router: {
    options: {
      hashMode: true
    }
  },

  // Disable app manifest to prevent 404 fetches in bundled mode
  experimental: {
    appManifest: false
  },

  // Configure Vite for building
  vite: {
    build: {
      minify: true,
      sourcemap: false,

      // Inline all assets smaller than 100KB as base64 data URIs
      assetsInlineLimit: 100 * 1024,

      rollupOptions: {
        output: {
          // Inline all dynamic imports into a single chunk
          inlineDynamicImports: true,
          manualChunks: undefined,
        },
      },
    },
  },

  // Inline all CSS
  css: [],
})
