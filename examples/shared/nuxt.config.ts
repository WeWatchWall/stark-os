// Nuxt layer — consumers add `extends: ['../path/to/examples/shared']` in their config.
// Components in components/ are auto-registered.
// Named exports from utils/*.ts are auto-imported (terminal internals live in
// utils/terminal/ subdirectory and are NOT auto-imported — only used by SharedTerminal).
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
})
