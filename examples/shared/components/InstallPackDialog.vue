<template>
  <div v-if="visible" class="ipd-overlay" @click.self="cancel" @keydown.escape="cancel">
    <div class="ipd-dialog" @click.stop>
      <!-- Header -->
      <div class="ipd-header">
        <span class="ipd-title">Install Pack — "{{ fileName }}"</span>
        <button class="ipd-close-btn" title="Close" @click="cancel">&times;</button>
      </div>

      <!-- Basic options -->
      <div class="ipd-section">
        <div class="ipd-section-title">
          <span class="ipd-section-icon">⚙️</span> Basic Options
        </div>
        <div class="ipd-field">
          <label class="ipd-label" title="Name to register this pack under">
            Pack Name
            <span class="ipd-hint">ⓘ</span>
            <span class="ipd-tooltip">The unique name for this pack. Combined with version, it must be unique within the resource namespace.</span>
          </label>
          <input v-model="form.name" class="ipd-input" type="text" :placeholder="defaultName" />
        </div>

        <div class="ipd-field-row">
          <div class="ipd-field ipd-field-half">
            <label class="ipd-label" title="Semantic version for this pack">
              Version
              <span class="ipd-hint">ⓘ</span>
              <span class="ipd-tooltip">Semantic version (e.g., 1.0.0). Must be unique for the pack name within its namespace.</span>
            </label>
            <input v-model="form.version" class="ipd-input" type="text" placeholder="1.0.0" />
          </div>
          <div class="ipd-field ipd-field-half">
            <label class="ipd-label" title="Target execution environment">
              Runtime
              <span class="ipd-hint">ⓘ</span>
              <span class="ipd-tooltip">node: runs on Node.js only. browser: runs in browser only. universal: runs on both.</span>
            </label>
            <select v-model="form.runtimeTag" class="ipd-select">
              <option value="browser">Browser</option>
              <option value="node">Node.js</option>
              <option value="universal">Universal</option>
            </select>
          </div>
        </div>

        <div class="ipd-field">
          <label class="ipd-label" title="Short description of what this pack does">
            Description
            <span class="ipd-hint">ⓘ</span>
            <span class="ipd-tooltip">A brief description shown in the start menu and open-with dialog.</span>
          </label>
          <input v-model="form.description" class="ipd-input" type="text" placeholder="A short description…" />
        </div>

        <div class="ipd-field-row">
          <div class="ipd-field ipd-field-half">
            <label class="ipd-label" title="Pack namespace determines trust level">
              Namespace
              <span class="ipd-hint">ⓘ</span>
              <span class="ipd-tooltip">system: full capabilities, admin-only registration. user: scoped access, resource-capped (default).</span>
            </label>
            <select v-model="form.namespace" class="ipd-select">
              <option value="user">User</option>
              <option value="system">System</option>
            </select>
          </div>
          <div class="ipd-field ipd-field-half">
            <label class="ipd-label" title="Who can access this pack">
              Visibility
              <span class="ipd-hint">ⓘ</span>
              <span class="ipd-tooltip">private: only owner and admins. public: anyone can access.</span>
            </label>
            <select v-model="form.visibility" class="ipd-select">
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </div>
        </div>

        <div class="ipd-field">
          <label class="ipd-label" title="Resource namespace for isolation">
            Resource Namespace
            <span class="ipd-hint">ⓘ</span>
            <span class="ipd-tooltip">Logical partition within which the pack name+version must be unique. Default is 'default'.</span>
          </label>
          <input v-model="form.resourceNamespace" class="ipd-input" type="text" placeholder="default" @input="onResourceNamespaceChange" />
          <div v-if="namespaceError" class="ipd-field-error">{{ namespaceError }}</div>
        </div>
      </div>

      <!-- Labels -->
      <div class="ipd-section">
        <div class="ipd-section-title">
          <span class="ipd-section-icon">🏷️</span> Labels
          <button class="ipd-add-btn" title="Add label" @click="addLabel">+ Add</button>
        </div>
        <div class="ipd-tooltip-block">
          Labels control pack behavior and organization.<br />
          <strong>start:&lt;group&gt;</strong> — groups the pack in the start menu (e.g. "start:Utilities").<br />
          <strong>start:hidden</strong> — hides the pack from the start menu and open-with dialog.<br />
          <strong>volume:&lt;name&gt;:&lt;path&gt;</strong> — declares a volume mount (e.g. "volume:data:/app/data").<br />
          <strong>service</strong> — marks the pack for dynamic service launch.
        </div>
        <div v-if="form.labels.length === 0" class="ipd-empty-list">No labels. Add labels for start-menu grouping, volume mounts, or service mode.</div>
        <div v-else class="ipd-list">
          <div v-for="(lbl, i) in form.labels" :key="i" class="ipd-list-row">
            <input v-model="form.labels[i]" class="ipd-input" placeholder="e.g. start:Utilities, service, volume:data:/app/data" />
            <button class="ipd-remove-btn" title="Remove" @click="form.labels.splice(i, 1)">×</button>
          </div>
        </div>
      </div>

      <!-- Metadata (collapsible) -->
      <details class="ipd-section ipd-collapsible">
        <summary class="ipd-section-title ipd-clickable">
          <span class="ipd-section-icon">📊</span> Pack Metadata
        </summary>
        <div class="ipd-field">
          <label class="ipd-label" title="Entry point function name in the bundle">
            Entrypoint
            <span class="ipd-hint">ⓘ</span>
            <span class="ipd-tooltip">The function name exported by the bundle that serves as the entry point. Default is 'main'.</span>
          </label>
          <input v-model="form.entrypoint" class="ipd-input" type="text" placeholder="main" />
        </div>
        <div class="ipd-field-row">
          <div class="ipd-field ipd-field-half">
            <label class="ipd-label" title="Maximum execution time in milliseconds">
              Timeout (ms)
              <span class="ipd-hint">ⓘ</span>
              <span class="ipd-tooltip">Maximum time the pack can run before being forcefully terminated. Leave empty for no limit.</span>
            </label>
            <input v-model.number="form.timeout" class="ipd-input" type="number" min="0" placeholder="(none)" />
          </div>
          <div class="ipd-field ipd-field-half">
            <label class="ipd-label" title="Minimum Node.js version required">
              Min Node Version
              <span class="ipd-hint">ⓘ</span>
              <span class="ipd-tooltip">Minimum Node.js version (e.g. "18.0.0"). Scheduler refuses nodes below this version.</span>
            </label>
            <input v-model="form.minNodeVersion" class="ipd-input" type="text" placeholder="(any)" />
          </div>
        </div>
        <div class="ipd-field">
          <label class="ipd-label" title="Enable ephemeral data plane for this pack">
            Ephemeral Data Plane
            <span class="ipd-hint">ⓘ</span>
            <span class="ipd-tooltip">When enabled, the runtime injects an EphemeralDataPlane instance as context.ephemeral for transient communication.</span>
          </label>
          <select v-model="form.enableEphemeral" class="ipd-select">
            <option :value="false">Disabled</option>
            <option :value="true">Enabled</option>
          </select>
        </div>
      </details>

      <!-- Capabilities (collapsible) -->
      <details class="ipd-section ipd-collapsible">
        <summary class="ipd-section-title ipd-clickable">
          <span class="ipd-section-icon">🔑</span> Requested Capabilities
        </summary>
        <div class="ipd-tooltip-block">
          Capabilities the pack needs. Granted based on namespace and runtime.<br />
          <strong>root</strong> — runs on main thread (not in worker), can render UI.<br />
          <strong>ui:render</strong> — can create visible UI elements.<br />
          Other capabilities depend on the orchestrator's policy.
        </div>
        <div class="ipd-list-inline">
          <button class="ipd-add-btn" @click="addCapability">+ Add Capability</button>
        </div>
        <div v-if="form.requestedCapabilities.length === 0" class="ipd-empty-list">No capabilities requested.</div>
        <div v-else class="ipd-list">
          <div v-for="(cap, i) in form.requestedCapabilities" :key="i" class="ipd-list-row">
            <input v-model="form.requestedCapabilities[i]" class="ipd-input" placeholder="e.g. root, ui:render" />
            <button class="ipd-remove-btn" title="Remove" @click="form.requestedCapabilities.splice(i, 1)">×</button>
          </div>
        </div>
      </details>

      <!-- Environment Variables (collapsible) -->
      <details class="ipd-section ipd-collapsible">
        <summary class="ipd-section-title ipd-clickable">
          <span class="ipd-section-icon">🔧</span> Environment Variables
        </summary>
        <div class="ipd-tooltip-block">Key-value environment variables available to the pack at runtime.</div>
        <div class="ipd-list-inline">
          <button class="ipd-add-btn" @click="addEnvVar">+ Add Variable</button>
        </div>
        <div v-if="form.envVars.length === 0" class="ipd-empty-list">No environment variables.</div>
        <div v-else class="ipd-list">
          <div v-for="(ev, i) in form.envVars" :key="i" class="ipd-list-row">
            <input v-model="ev.key" class="ipd-input ipd-input-half" placeholder="Key" />
            <input v-model="ev.value" class="ipd-input ipd-input-half" placeholder="Value" />
            <button class="ipd-remove-btn" title="Remove" @click="form.envVars.splice(i, 1)">×</button>
          </div>
        </div>
      </details>

      <!-- Actions -->
      <div class="ipd-actions">
        <button class="ipd-btn ipd-btn-cancel" @click="cancel">Cancel</button>
        <button class="ipd-btn ipd-btn-install" :disabled="installing || !form.name.trim() || !form.version.trim() || !!namespaceError" @click="install">
          {{ installing ? 'Installing…' : '📥 Install Pack' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { createStarkAPI } from '@stark-o/browser-runtime';
import {
  fetchUserInfo,
  validateNamespace,
  type UserInfo,
} from '../utils/lib/packs';

/* ── Props ── */
const props = withDefaults(defineProps<{
  visible?: boolean;
  fileName?: string;
  filePath?: string;
}>(), {
  visible: false,
  fileName: '',
  filePath: '',
});

/* ── Emits ── */
const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'installed'): void;
  (e: 'update:visible', val: boolean): void;
}>();

/* ── Types ── */
interface KV { key: string; value: string }

/* ── State ── */
const installing = ref(false);
const bundleContent = ref('');
const userInfo = ref<UserInfo>({ email: '', userId: '', isAdmin: false, defaultNamespace: 'default' });
const namespaceError = ref('');

const form = reactive({
  name: '',
  version: '1.0.0',
  runtimeTag: 'browser' as 'node' | 'browser' | 'universal',
  description: '',
  namespace: 'user' as 'system' | 'user',
  visibility: 'private' as 'private' | 'public',
  resourceNamespace: 'default',
  labels: [] as string[],
  entrypoint: '',
  timeout: null as number | null,
  minNodeVersion: '',
  enableEphemeral: false,
  requestedCapabilities: [] as string[],
  envVars: [] as KV[],
});

/* ── Computed ── */
const defaultName = computed(() => {
  const fn = props.fileName || '';
  return fn.replace(/\.pack\.js$/i, '') || 'my-pack';
});

/* ── Watchers ── */
watch(() => props.visible, async (val) => {
  if (!val) return;

  // Fetch user info for namespace defaulting
  userInfo.value = fetchUserInfo();

  // Reset form
  form.name = defaultName.value;
  form.version = '1.0.0';
  form.runtimeTag = 'browser';
  form.description = '';
  form.namespace = userInfo.value.isAdmin ? 'user' : 'user';
  form.visibility = 'private';
  form.resourceNamespace = userInfo.value.defaultNamespace;
  form.labels = [];
  form.entrypoint = '';
  form.timeout = null;
  form.minNodeVersion = '';
  form.enableEphemeral = false;
  form.requestedCapabilities = [];
  form.envVars = [];
  installing.value = false;
  bundleContent.value = '';
  namespaceError.value = '';

  // Read the bundle file from OPFS
  if (props.filePath) {
    try {
      const { getStarkOpfsRoot, getFileHandle } = await import('../utils/lib/opfs');
      const root = await getStarkOpfsRoot();
      if (root) {
        const fh = await getFileHandle(root, props.filePath);
        const file = await fh.getFile();
        bundleContent.value = await file.text();
      }
    } catch (err) {
      console.warn('InstallPackDialog: Failed to read bundle:', err);
    }
  }
});

/* ── Helpers ── */
function addLabel() { form.labels.push(''); }
function addCapability() { form.requestedCapabilities.push(''); }
function addEnvVar() { form.envVars.push({ key: '', value: '' }); }

function onResourceNamespaceChange() {
  namespaceError.value = validateNamespace(form.resourceNamespace, userInfo.value);
}

function cancel() {
  emit('cancel');
  emit('update:visible', false);
}

async function install() {
  if (installing.value || !form.name.trim() || !form.version.trim()) return;
  installing.value = true;

  try {
    const api = createStarkAPI();

    const metadata: Record<string, unknown> = {};
    if (form.entrypoint) metadata.entrypoint = form.entrypoint;
    if (form.timeout && form.timeout > 0) metadata.timeout = form.timeout;
    if (form.minNodeVersion) metadata.minNodeVersion = form.minNodeVersion;
    if (form.enableEphemeral) metadata.enableEphemeral = true;

    const caps = form.requestedCapabilities.filter((c) => c.trim());
    if (caps.length > 0) metadata.requestedCapabilities = caps;

    const labels = form.labels.filter((l) => l.trim());
    if (labels.length > 0) metadata.labels = labels;

    const env: Record<string, string> = {};
    for (const ev of form.envVars) {
      if (ev.key.trim()) env[ev.key.trim()] = ev.value;
    }
    if (Object.keys(env).length > 0) metadata.env = env;

    const opts: Record<string, unknown> = {
      name: form.name.trim(),
      version: form.version.trim(),
      runtimeTag: form.runtimeTag,
    };

    if (form.namespace !== 'user') opts.namespace = form.namespace;
    if (form.resourceNamespace && form.resourceNamespace !== 'default') {
      opts.resourceNamespace = form.resourceNamespace;
    }
    if (form.visibility !== 'private') opts.visibility = form.visibility;
    if (form.description) opts.description = form.description;
    if (Object.keys(metadata).length > 0) opts.metadata = metadata;
    if (bundleContent.value) opts.bundleContent = bundleContent.value;

    await api.pack.register(opts);
    emit('installed');
    emit('update:visible', false);
  } catch (err: unknown) {
    console.error('InstallPackDialog: Failed to install pack:', err);
    alert(`Failed to install pack: ${err instanceof Error ? err.message : 'Unknown error'}`);
  } finally {
    installing.value = false;
  }
}
</script>

<style scoped>
.ipd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.ipd-dialog {
  background: linear-gradient(180deg, #0f172a 0%, #1a2332 100%);
  border: 1px solid rgba(168, 85, 247, 0.25);
  border-radius: 12px;
  width: 520px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow-y: auto;
}
.ipd-dialog::-webkit-scrollbar { width: 5px; }
.ipd-dialog::-webkit-scrollbar-track { background: transparent; }
.ipd-dialog::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 3px; }

.ipd-header {
  display: flex;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.ipd-title {
  flex: 1;
  font-size: 0.95rem;
  font-weight: 600;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ipd-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.4rem;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.ipd-close-btn:hover { color: #e2e8f0; }

.ipd-section {
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.ipd-collapsible > summary { list-style: none; }
.ipd-collapsible > summary::-webkit-details-marker { display: none; }
.ipd-collapsible > summary::before { content: '▸ '; color: #64748b; }
.ipd-collapsible[open] > summary::before { content: '▾ '; }

.ipd-section-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ipd-clickable { cursor: pointer; }
.ipd-section-icon { font-size: 0.9rem; }

.ipd-field { margin-bottom: 10px; position: relative; }
.ipd-field-row { display: flex; gap: 12px; }
.ipd-field-half { flex: 1; }

.ipd-label {
  display: block;
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 4px;
  position: relative;
  cursor: default;
}

.ipd-hint {
  font-size: 0.65rem;
  color: #475569;
  cursor: help;
  margin-left: 2px;
}

.ipd-tooltip {
  display: none;
  position: absolute;
  left: 0;
  top: 100%;
  background: #1e293b;
  border: 1px solid rgba(168, 85, 247, 0.3);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.7rem;
  color: #cbd5e1;
  max-width: 280px;
  z-index: 10;
  white-space: normal;
  line-height: 1.4;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.ipd-label:hover .ipd-tooltip { display: block; }

.ipd-tooltip-block {
  font-size: 0.68rem;
  color: #475569;
  margin: -6px 0 8px;
  line-height: 1.4;
}

.ipd-input, .ipd-select, .ipd-textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 7px 10px;
  color: #e2e8f0;
  font-size: 0.82rem;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}
.ipd-input:focus, .ipd-select:focus, .ipd-textarea:focus { border-color: rgba(168, 85, 247, 0.5); }
.ipd-input::placeholder, .ipd-textarea::placeholder { color: #475569; }

.ipd-select { cursor: pointer; }
.ipd-select option { background: #1e293b; color: #e2e8f0; }
.ipd-textarea { resize: vertical; min-height: 40px; }
.ipd-input-half { flex: 1; }

.ipd-list {
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 4px;
}
.ipd-list::-webkit-scrollbar { width: 3px; }
.ipd-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 2px; }

.ipd-list-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 4px;
}
.ipd-list-row:last-child { margin-bottom: 0; }

.ipd-list-row .ipd-input {
  padding: 5px 8px;
  font-size: 0.78rem;
}

.ipd-list-inline {
  margin-bottom: 8px;
}

.ipd-add-btn {
  margin-left: auto;
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.25);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.68rem;
  cursor: pointer;
  transition: background 0.15s;
}
.ipd-add-btn:hover { background: rgba(168, 85, 247, 0.25); }

.ipd-remove-btn {
  background: none;
  border: none;
  color: #f87171;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0 4px;
  flex-shrink: 0;
  line-height: 1;
}
.ipd-remove-btn:hover { color: #fca5a5; }

.ipd-empty-list {
  font-size: 0.72rem;
  color: #475569;
  padding: 4px 0;
}

.ipd-field-error {
  font-size: 0.7rem;
  color: #f87171;
  margin-top: 3px;
  line-height: 1.3;
}

.ipd-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.15);
}

.ipd-btn {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.ipd-btn-cancel {
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  border-color: rgba(255, 255, 255, 0.1);
}
.ipd-btn-cancel:hover { background: rgba(255, 255, 255, 0.1); color: #e2e8f0; }

.ipd-btn-install {
  background: linear-gradient(135deg, #7c3aed, #a855f7);
  color: #fff;
  border-color: rgba(168, 85, 247, 0.5);
}
.ipd-btn-install:hover { background: linear-gradient(135deg, #6d28d9, #7c3aed); }
.ipd-btn-install:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
