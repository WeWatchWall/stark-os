<template>
  <div v-if="visible" class="ow-overlay" @click.self="cancel">
    <div class="ow-dialog">
      <!-- Header -->
      <div class="ow-header">
        <span class="ow-title">Open With</span>
        <button class="ow-close-btn" title="Close" @click="cancel">&times;</button>
      </div>

      <!-- Description -->
      <div class="ow-desc">
        <template v-if="filenames.length === 1">
          Choose an application to open <strong>{{ filenames[0] }}</strong>
        </template>
        <template v-else>
          Choose an application to open <strong>{{ filenames.length }} files</strong>
        </template>
      </div>

      <!-- App list -->
      <div class="ow-list">
        <div v-if="loading" class="ow-loading">Loading applications…</div>
        <div v-else-if="filteredPacks.length === 0" class="ow-empty">
          No compatible applications found.
        </div>
        <div
          v-for="pack in filteredPacks"
          v-else
          :key="pack.name"
          class="ow-item"
          :class="{ 'ow-selected': selectedPack === pack.name }"
          @click="selectedPack = pack.name"
          @dblclick="openWith(pack.name, false)"
        >
          <span class="ow-item-name">{{ pack.name }}</span>
          <span v-if="pack.description" class="ow-item-desc">{{ pack.description }}</span>
          <span class="ow-item-tag">{{ pack.runtimeTag }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="ow-actions">
        <button class="ow-btn ow-btn-cancel" @click="cancel">Cancel</button>
        <button
          class="ow-btn ow-btn-once"
          :disabled="!selectedPack"
          @click="confirmOnce"
        >Just Once</button>
        <button
          v-if="singleExtension"
          class="ow-btn ow-btn-always"
          :disabled="!selectedPack"
          title="Set as default for this file type"
          @click="confirmAlways"
        >Always</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { commonExtension, browserCompatiblePacks } from '../utils/lib/intents';
import type { IntentPackInfo } from '../utils/lib/intents';

/* ── Props ── */

const props = withDefaults(defineProps<{
  /** Whether the dialog is visible. */
  visible?: boolean;
  /** The filenames to open (used for display and extension detection). */
  filenames?: string[];
  /** Available packs (pre-filtered or full list). */
  packs?: IntentPackInfo[];
  /** Whether the pack list is still loading. */
  loading?: boolean;
}>(), {
  visible: false,
  filenames: () => [],
  packs: () => [],
  loading: false,
});

/* ── Emits ── */

const emit = defineEmits<{
  /** User chose a pack. */
  (e: 'select', packName: string, setDefault: boolean): void;
  /** User cancelled. */
  (e: 'cancel'): void;
  /** Visibility toggle (for v-model:visible). */
  (e: 'update:visible', val: boolean): void;
}>();

/* ── State ── */

const selectedPack = ref('');

/* ── Computed ── */

/**
 * If all files share the same extension, return it; otherwise empty string.
 * Determines whether the "Always" button is shown.
 */
const singleExtension = computed(() => commonExtension(props.filenames));

/** Packs filtered to browser/universal only. */
const filteredPacks = computed(() =>
  browserCompatiblePacks(props.packs).sort((a, b) => a.name.localeCompare(b.name)),
);

/* ── Watchers ── */

watch(() => props.visible, (val) => {
  if (val) {
    selectedPack.value = '';
  }
});

/* ── Handlers ── */

function cancel(): void {
  emit('cancel');
  emit('update:visible', false);
}

function openWith(packName: string, setDefault: boolean): void {
  emit('select', packName, setDefault);
  emit('update:visible', false);
}

function confirmOnce(): void {
  if (!selectedPack.value) return;
  openWith(selectedPack.value, false);
}

function confirmAlways(): void {
  if (!selectedPack.value) return;
  openWith(selectedPack.value, true);
}
</script>

<style scoped>
.ow-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}

.ow-dialog {
  width: 420px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  color: #e2e8f0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}

/* Header */
.ow-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.ow-title {
  font-size: 0.95rem;
  font-weight: 600;
}

.ow-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.3rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}
.ow-close-btn:hover {
  color: #e2e8f0;
}

/* Description */
.ow-desc {
  padding: 10px 16px;
  font-size: 0.82rem;
  color: #94a3b8;
  flex-shrink: 0;
}
.ow-desc strong {
  color: #cbd5e1;
}

/* List */
.ow-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 8px;
}

.ow-list::-webkit-scrollbar {
  width: 6px;
}
.ow-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.ow-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s;
  user-select: none;
}
.ow-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.ow-item.ow-selected {
  background: rgba(59, 130, 246, 0.2);
}

.ow-item-name {
  font-size: 0.85rem;
  font-weight: 500;
  color: #e2e8f0;
  white-space: nowrap;
}

.ow-item-desc {
  flex: 1;
  font-size: 0.75rem;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.ow-item-tag {
  font-size: 0.65rem;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.ow-loading,
.ow-empty {
  padding: 24px 16px;
  text-align: center;
  color: #64748b;
  font-size: 0.82rem;
}

/* Actions */
.ow-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.ow-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.12s;
}

.ow-btn-cancel {
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
}
.ow-btn-cancel:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

.ow-btn-once {
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
}
.ow-btn-once:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
}
.ow-btn-once:disabled {
  opacity: 0.4;
  cursor: default;
}

.ow-btn-always {
  background: #3b82f6;
  color: #fff;
}
.ow-btn-always:hover:not(:disabled) {
  background: #2563eb;
}
.ow-btn-always:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
