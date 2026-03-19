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
  height: 100% !important;
  overflow: hidden !important;
  background: #1e1e1e !important;
  color: #e2e8f0;
}

/*
 * Force PrimeVue dark surface overrides.
 * The Aura dark preset sets CSS vars but some components read from
 * --p-content-background which defaults to a light surface.
 * Override all key variables so every PrimeVue component is dark.
 */
:root {
  --p-surface-0: #ffffff;
  --p-surface-50: #e2e8f0;
  --p-surface-100: #cbd5e1;
  --p-surface-200: #94a3b8;
  --p-surface-300: #64748b;
  --p-surface-400: #475569;
  --p-surface-500: #334155;
  --p-surface-600: #1e293b;
  --p-surface-700: #1e1e1e;
  --p-surface-800: #181818;
  --p-surface-900: #121212;
  --p-surface-950: #0a0a0a;

  /* Content / component backgrounds */
  --p-content-background: #1e1e1e;
  --p-content-color: #e2e8f0;
  --p-content-border-color: rgba(255, 255, 255, 0.08);
  --p-content-hover-background: rgba(59, 130, 246, 0.08);
  --p-content-hover-color: #f1f5f9;

  /* Text */
  --p-text-color: #e2e8f0;
  --p-text-muted-color: #94a3b8;

  /* Primary */
  --p-primary-color: #3b82f6;
  --p-primary-contrast-color: #ffffff;

  /* Highlight */
  --p-highlight-background: rgba(59, 130, 246, 0.16);
  --p-highlight-color: #93c5fd;
  --p-highlight-focus-background: rgba(59, 130, 246, 0.24);
  --p-highlight-focus-color: #bfdbfe;
}

/* DataTable dark overrides */
.p-datatable {
  --p-datatable-header-background: #181818;
  --p-datatable-header-color: #94a3b8;
  --p-datatable-header-border-color: rgba(255, 255, 255, 0.08);
  --p-datatable-row-background: #1e1e1e;
  --p-datatable-row-color: #e2e8f0;
  --p-datatable-body-cell-border-color: rgba(255, 255, 255, 0.06);
  --p-datatable-row-toggle-button-hover-background: rgba(59, 130, 246, 0.1);
}

.p-datatable .p-datatable-thead > tr > th {
  background: #181818 !important;
  color: #94a3b8 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.p-datatable .p-datatable-tbody > tr {
  background: #1e1e1e !important;
  color: #e2e8f0 !important;
}

.p-datatable .p-datatable-tbody > tr:nth-child(even) {
  background: #1a1a1a !important;
}

.p-datatable .p-datatable-tbody > tr > td {
  border-color: rgba(255, 255, 255, 0.06) !important;
}

.p-datatable .p-datatable-tbody > tr:hover {
  background: rgba(59, 130, 246, 0.06) !important;
}

/* PrimeVue 4 row group header overrides */
.p-datatable .p-datatable-row-group-header {
  background: #181818 !important;
}

.p-datatable .p-datatable-row-group-header td {
  border-color: rgba(255, 255, 255, 0.08) !important;
}

/* Hide PrimeVue's default row group toggle button — we render our own chevron */
.p-datatable .p-datatable-row-group-header .p-datatable-row-toggle-button {
  display: none !important;
}

/* Legacy class names (PrimeVue 3 compat) */
.p-datatable .p-rowgroup-header {
  background: #181818 !important;
}

.p-datatable .p-rowgroup-header td {
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.p-datatable .p-rowgroup-header .p-row-toggler {
  display: none !important;
}

/* Card dark overrides */
.p-card {
  background: #181818 !important;
  color: #e2e8f0 !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: none !important;
}

.p-card .p-card-title {
  color: #e2e8f0 !important;
}

.p-card .p-card-subtitle {
  color: #94a3b8 !important;
}

/* Tabs dark overrides */
.p-tabs {
  background: transparent !important;
}

.p-tablist {
  background: #181818 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.p-tab {
  background: transparent !important;
  color: #94a3b8 !important;
}

.p-tab:hover {
  color: #e2e8f0 !important;
}

.p-tab[data-p-active="true"],
.p-tab-active {
  color: #3b82f6 !important;
}

.p-tabpanels {
  background: transparent !important;
}

.p-tabpanel {
  background: transparent !important;
}

/* Button dark overrides */
.p-button.p-button-secondary,
.p-button.p-button-outlined {
  color: #94a3b8;
  border-color: rgba(255, 255, 255, 0.15);
}

.p-button.p-button-secondary:hover,
.p-button.p-button-outlined:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
}

/* Toast dark overrides */
.p-toast-message {
  background: #1e293b !important;
  color: #e2e8f0 !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
}

/* ProgressBar dark overrides */
.p-progressbar {
  background: #334155 !important;
}

/* Knob dark overrides */
.p-knob-text {
  fill: #e2e8f0 !important;
}

/* InputText dark overrides */
.p-inputtext {
  background: #1e1e1e !important;
  color: #e2e8f0 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

.p-inputtext:focus {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.3) !important;
}

/* Select dark overrides */
.p-select {
  background: #1e1e1e !important;
  color: #e2e8f0 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

.p-select-label {
  color: #e2e8f0 !important;
}

.p-select-dropdown {
  color: #94a3b8 !important;
}

/* Select overlay / dropdown panel dark overrides */
.p-select-overlay,
.p-select-panel {
  background: #1e1e1e !important;
  color: #e2e8f0 !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
}

.p-select-list .p-select-option {
  color: #e2e8f0 !important;
}

.p-select-list .p-select-option:hover,
.p-select-list .p-select-option.p-focus {
  background: rgba(59, 130, 246, 0.1) !important;
  color: #f1f5f9 !important;
}

.p-select-list .p-select-option.p-selected,
.p-select-list .p-select-option.p-highlight {
  background: rgba(59, 130, 246, 0.2) !important;
  color: #93c5fd !important;
}

.p-select-filter {
  background: #181818 !important;
  color: #e2e8f0 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

.p-select-empty-message {
  color: #64748b !important;
}

/* MultiSelect dark overrides */
.p-multiselect {
  background: #1e1e1e !important;
  color: #e2e8f0 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

.p-multiselect-label {
  color: #e2e8f0 !important;
}

.p-multiselect-dropdown {
  color: #94a3b8 !important;
}

.p-multiselect-overlay,
.p-multiselect-panel {
  background: #1e1e1e !important;
  color: #e2e8f0 !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
}

.p-multiselect-header {
  background: #181818 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.p-multiselect-filter-container .p-inputtext,
.p-multiselect-filter {
  background: #181818 !important;
  color: #e2e8f0 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

.p-multiselect-list .p-multiselect-option {
  color: #e2e8f0 !important;
}

.p-multiselect-list .p-multiselect-option:hover,
.p-multiselect-list .p-multiselect-option.p-focus {
  background: rgba(59, 130, 246, 0.1) !important;
  color: #f1f5f9 !important;
}

.p-multiselect-list .p-multiselect-option.p-selected,
.p-multiselect-list .p-multiselect-option.p-highlight {
  background: rgba(59, 130, 246, 0.2) !important;
  color: #93c5fd !important;
}

.p-multiselect-chip {
  background: rgba(59, 130, 246, 0.15) !important;
  color: #93c5fd !important;
}

.p-multiselect-empty-message {
  color: #64748b !important;
}

/* Checkbox dark overrides (used in MultiSelect) */
.p-checkbox .p-checkbox-box {
  background: #181818 !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
}

.p-checkbox .p-checkbox-box.p-highlight {
  background: #3b82f6 !important;
  border-color: #3b82f6 !important;
}

/* Tag overrides for readability */
.p-tag {
  font-size: 0.75rem;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
