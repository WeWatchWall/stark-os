<template>
  <div id="app">
    <NuxtPage />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app, #__nuxt {
  width: 100%;
  height: 100%;
  /* !important overrides VS Code service styles that may set body background to white */
  background: #1e1e1e !important;
  color: #cccccc;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
