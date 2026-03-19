<template>
  <div v-if="visible" class="rpd-overlay" @click.self="cancel" @keydown.escape="cancel">
    <div class="rpd-dialog" @click.stop>
      <!-- Header -->
      <div class="rpd-header">
        <span class="rpd-title">Run "{{ appName }}"</span>
        <button class="rpd-close-btn" title="Close" @click="cancel">&times;</button>
      </div>

      <!-- Node selection -->
      <div class="rpd-section">
        <div class="rpd-section-title">
          <span class="rpd-section-icon">🎯</span> Target Node
        </div>
        <div class="rpd-field">
          <label class="rpd-label" title="Select a compatible online node to run this pack on">
            Node
            <span class="rpd-hint">ⓘ</span>
            <span class="rpd-tooltip">Choose which node will execute this pack. Only online nodes compatible with the pack runtime are shown.</span>
          </label>
          <select v-model="form.nodeId" class="rpd-select">
            <option value="">Auto (scheduler decides)</option>
            <option v-for="n in compatibleNodes" :key="n.id" :value="n.id">
              {{ n.name }} ({{ n.runtimeType }}, {{ n.status }})
            </option>
          </select>
        </div>
      </div>

      <!-- Basic options -->
      <div class="rpd-section">
        <div class="rpd-section-title">
          <span class="rpd-section-icon">⚙️</span> Basic Options
        </div>
        <div class="rpd-field">
          <label class="rpd-label" title="Kubernetes-like namespace for resource isolation">
            Namespace
            <span class="rpd-hint">ⓘ</span>
            <span class="rpd-tooltip">Logical grouping for resource isolation. Pods in the same namespace can discover each other.</span>
          </label>
          <input v-model="form.namespace" class="rpd-input" type="text" placeholder="default" @input="onNamespaceChange" />
          <div v-if="namespaceError" class="rpd-field-error">{{ namespaceError }}</div>
        </div>

        <!-- Dynamic service (read-only if present) -->
        <div v-if="dynamicServiceName" class="rpd-field">
          <label class="rpd-label" title="This pack will be launched under a dynamic service">
            Service
            <span class="rpd-hint">ⓘ</span>
            <span class="rpd-tooltip">This pack has the "service" label and will be launched under this dynamic service. The service manages lifecycle and scaling.</span>
          </label>
          <input :value="dynamicServiceName" class="rpd-input rpd-readonly" type="text" readonly />
        </div>

        <div class="rpd-field">
          <label class="rpd-label" title="Arguments passed to the pack entrypoint function">
            Arguments
            <span class="rpd-hint">ⓘ</span>
            <span class="rpd-tooltip">Command-line-like arguments passed to the pack's entrypoint function. Separate multiple args with newlines.</span>
          </label>
          <textarea v-model="argsText" class="rpd-textarea" rows="2" placeholder="One argument per line" />
        </div>
      </div>

      <!-- Volume mounts -->
      <div class="rpd-section">
        <div class="rpd-section-title">
          <span class="rpd-section-icon">💾</span> Volume Mounts
          <button class="rpd-add-btn" title="Add volume mount" @click="addVolumeMount">+ Add</button>
        </div>
        <div class="rpd-tooltip-block">Named persistent storage mapped into the pack runtime. Format: volume name → mount path.</div>
        <div v-if="form.volumeMounts.length === 0" class="rpd-empty-list">No volume mounts configured.</div>
        <div v-else class="rpd-list">
          <div v-for="(vm, i) in form.volumeMounts" :key="i" class="rpd-list-row">
            <input v-model="vm.name" class="rpd-input rpd-input-half" placeholder="Volume name" title="Name of the volume on the target node" />
            <input v-model="vm.mountPath" class="rpd-input rpd-input-half" placeholder="/mount/path" title="Absolute path inside the pack runtime" />
            <button class="rpd-remove-btn" title="Remove this volume mount" @click="form.volumeMounts.splice(i, 1)">×</button>
          </div>
        </div>
      </div>

      <!-- Labels -->
      <div class="rpd-section">
        <div class="rpd-section-title">
          <span class="rpd-section-icon">🏷️</span> Labels
          <button class="rpd-add-btn" title="Add label" @click="addLabel">+ Add</button>
        </div>
        <div class="rpd-tooltip-block">Key-value pairs for organizing and selecting pods. Use "service" label for dynamic service attachment.</div>
        <div v-if="form.labels.length === 0" class="rpd-empty-list">No labels.</div>
        <div v-else class="rpd-list">
          <div v-for="(lbl, i) in form.labels" :key="i" class="rpd-list-row">
            <input v-model="lbl.key" class="rpd-input rpd-input-half" placeholder="Key" />
            <input v-model="lbl.value" class="rpd-input rpd-input-half" placeholder="Value" />
            <button class="rpd-remove-btn" title="Remove" @click="form.labels.splice(i, 1)">×</button>
          </div>
        </div>
      </div>

      <!-- Performance (collapsible) -->
      <details class="rpd-section rpd-collapsible">
        <summary class="rpd-section-title rpd-clickable">
          <span class="rpd-section-icon">📊</span> Performance &amp; Resources
        </summary>
        <div class="rpd-field-row">
          <div class="rpd-field rpd-field-half">
            <label class="rpd-label" title="Minimum CPU millicores requested">
              CPU Request (mc)
              <span class="rpd-hint">ⓘ</span>
              <span class="rpd-tooltip">Minimum CPU in millicores (1000mc = 1 CPU). The scheduler guarantees at least this much.</span>
            </label>
            <input v-model.number="form.resourceRequests.cpu" class="rpd-input" type="number" min="0" step="50" placeholder="100" />
          </div>
          <div class="rpd-field rpd-field-half">
            <label class="rpd-label" title="Maximum CPU millicores allowed">
              CPU Limit (mc)
              <span class="rpd-hint">ⓘ</span>
              <span class="rpd-tooltip">Maximum CPU the pod can use. Exceeding this may cause throttling.</span>
            </label>
            <input v-model.number="form.resourceLimits.cpu" class="rpd-input" type="number" min="0" step="50" placeholder="500" />
          </div>
        </div>
        <div class="rpd-field-row">
          <div class="rpd-field rpd-field-half">
            <label class="rpd-label" title="Minimum memory in MB requested">
              Memory Request (MB)
              <span class="rpd-hint">ⓘ</span>
              <span class="rpd-tooltip">Minimum memory in megabytes. The scheduler reserves this amount on the node.</span>
            </label>
            <input v-model.number="form.resourceRequests.memory" class="rpd-input" type="number" min="0" step="32" placeholder="128" />
          </div>
          <div class="rpd-field rpd-field-half">
            <label class="rpd-label" title="Maximum memory in MB allowed">
              Memory Limit (MB)
              <span class="rpd-hint">ⓘ</span>
              <span class="rpd-tooltip">Maximum memory the pod can use. Exceeding this causes OOM termination.</span>
            </label>
            <input v-model.number="form.resourceLimits.memory" class="rpd-input" type="number" min="0" step="32" placeholder="512" />
          </div>
        </div>
        <div class="rpd-field">
          <label class="rpd-label" title="Priority class for scheduling preference">
            Priority Class
            <span class="rpd-hint">ⓘ</span>
            <span class="rpd-tooltip">Named priority class that determines scheduling order and preemption. Higher priority pods are scheduled first.</span>
          </label>
          <input v-model="form.priorityClassName" class="rpd-input" type="text" placeholder="(none)" />
        </div>
      </details>

      <!-- Advanced (collapsible) -->
      <details class="rpd-section rpd-collapsible">
        <summary class="rpd-section-title rpd-clickable">
          <span class="rpd-section-icon">🔧</span> Advanced Options
        </summary>

        <!-- Annotations -->
        <div class="rpd-subsection">
          <div class="rpd-subsection-title">
            Annotations
            <button class="rpd-add-btn" title="Add annotation" @click="addAnnotation">+ Add</button>
          </div>
          <div class="rpd-tooltip-block">Non-identifying metadata attached to the pod. Used for tooling and operational notes.</div>
          <div v-if="form.annotations.length === 0" class="rpd-empty-list">No annotations.</div>
          <div v-else class="rpd-list">
            <div v-for="(ann, i) in form.annotations" :key="i" class="rpd-list-row">
              <input v-model="ann.key" class="rpd-input rpd-input-half" placeholder="Key" />
              <input v-model="ann.value" class="rpd-input rpd-input-half" placeholder="Value" />
              <button class="rpd-remove-btn" title="Remove" @click="form.annotations.splice(i, 1)">×</button>
            </div>
          </div>
        </div>

        <!-- Tolerations -->
        <div class="rpd-subsection">
          <div class="rpd-subsection-title">
            Tolerations
            <button class="rpd-add-btn" title="Add toleration" @click="addToleration">+ Add</button>
          </div>
          <div class="rpd-tooltip-block">Allow scheduling on tainted nodes. Each toleration matches a node taint by key/value/effect.</div>
          <div v-if="form.tolerations.length === 0" class="rpd-empty-list">No tolerations.</div>
          <div v-else class="rpd-list">
            <div v-for="(tol, i) in form.tolerations" :key="i" class="rpd-list-row rpd-list-row-wide">
              <input v-model="tol.key" class="rpd-input" placeholder="Key" style="flex:2" />
              <select v-model="tol.operator" class="rpd-select" style="flex:1">
                <option value="Equal">Equal</option>
                <option value="Exists">Exists</option>
              </select>
              <input v-model="tol.value" class="rpd-input" placeholder="Value" style="flex:2" :disabled="tol.operator === 'Exists'" />
              <select v-model="tol.effect" class="rpd-select" style="flex:1.5">
                <option value="">Any</option>
                <option value="NoSchedule">NoSchedule</option>
                <option value="PreferNoSchedule">PreferNoSchedule</option>
                <option value="NoExecute">NoExecute</option>
              </select>
              <button class="rpd-remove-btn" title="Remove" @click="form.tolerations.splice(i, 1)">×</button>
            </div>
          </div>
        </div>

        <!-- Scheduling / nodeSelector -->
        <div class="rpd-subsection">
          <div class="rpd-subsection-title">
            Node Selector
            <button class="rpd-add-btn" title="Add selector" @click="addNodeSelector">+ Add</button>
          </div>
          <div class="rpd-tooltip-block">Simple key=value label selectors. Pod is only scheduled on nodes matching ALL selectors.</div>
          <div v-if="form.nodeSelector.length === 0" class="rpd-empty-list">No node selectors.</div>
          <div v-else class="rpd-list">
            <div v-for="(sel, i) in form.nodeSelector" :key="i" class="rpd-list-row">
              <input v-model="sel.key" class="rpd-input rpd-input-half" placeholder="Key" />
              <input v-model="sel.value" class="rpd-input rpd-input-half" placeholder="Value" />
              <button class="rpd-remove-btn" title="Remove" @click="form.nodeSelector.splice(i, 1)">×</button>
            </div>
          </div>
        </div>

        <div class="rpd-field">
          <label class="rpd-label" title="Additional metadata stored with the pod">
            Metadata (JSON)
            <span class="rpd-hint">ⓘ</span>
            <span class="rpd-tooltip">Arbitrary JSON metadata attached to the pod record. Useful for custom tooling.</span>
          </label>
          <textarea v-model="metadataJson" class="rpd-textarea" rows="2" placeholder='{"key": "value"}' />
        </div>
      </details>

      <!-- Actions -->
      <div class="rpd-actions">
        <button class="rpd-btn rpd-btn-cancel" @click="cancel">Cancel</button>
        <button class="rpd-btn rpd-btn-run" :disabled="launching || !!namespaceError" @click="run">
          {{ launching ? 'Launching…' : '▶ Run' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { createStarkAPI } from '@stark-o/browser-runtime';
import {
  extractVolumeMounts,
  hasServiceLabel,
  fetchDynamicServicesForPack,
  getBrowserNodeId,
  fetchUserInfo,
  validateNamespace,
  type AppEntry,
  type DynamicServiceItem,
  type UserInfo,
} from '../utils/lib/packs';

/* ── Props ── */
const props = withDefaults(defineProps<{
  visible?: boolean;
  app?: AppEntry | null;
}>(), {
  visible: false,
  app: null,
});

/* ── Emits ── */
const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'launched'): void;
  (e: 'update:visible', val: boolean): void;
}>();

/* ── Types ── */
interface KV { key: string; value: string }
interface TolEntry { key: string; operator: string; value: string; effect: string }

/* ── State ── */
const launching = ref(false);
const nodes = ref<Array<{ id: string; name: string; runtimeType: string; status: string }>>([]);
const dynamicServiceName = ref('');
const dynamicServiceId = ref('');
const userInfo = ref<UserInfo>({ email: '', userId: '', isAdmin: false, defaultNamespace: 'default' });
const namespaceError = ref('');

const form = reactive({
  nodeId: '',
  namespace: 'default',
  labels: [] as KV[],
  annotations: [] as KV[],
  priorityClassName: '',
  tolerations: [] as TolEntry[],
  resourceRequests: { cpu: 100, memory: 128 },
  resourceLimits: { cpu: 500, memory: 512 },
  volumeMounts: [] as Array<{ name: string; mountPath: string }>,
  nodeSelector: [] as KV[],
  args: [] as string[],
});

const argsText = ref('');
const metadataJson = ref('{}');

/* ── Computed ── */
const appName = computed(() => props.app?.name ?? '');

const compatibleNodes = computed(() => {
  if (!props.app) return nodes.value.filter((n) => n.status === 'online');
  const rt = props.app.pack.runtimeTag;
  return nodes.value.filter((n) => {
    if (n.status !== 'online') return false;
    if (rt === 'universal') return true;
    if (rt === 'browser' && n.runtimeType === 'browser') return true;
    if (rt === 'node' && n.runtimeType === 'node') return true;
    return false;
  });
});

/* ── Watchers ── */
watch(() => props.visible, async (val) => {
  if (!val || !props.app) return;

  // Fetch user info for namespace defaulting
  userInfo.value = await fetchUserInfo();

  // Reset form
  form.nodeId = '';
  form.namespace = userInfo.value.defaultNamespace;
  form.labels = [];
  form.annotations = [];
  form.priorityClassName = '';
  form.tolerations = [];
  form.resourceRequests = { cpu: 100, memory: 128 };
  form.resourceLimits = { cpu: 500, memory: 512 };
  form.nodeSelector = [];
  form.args = [];
  argsText.value = '';
  metadataJson.value = '{}';
  launching.value = false;
  dynamicServiceName.value = '';
  dynamicServiceId.value = '';
  namespaceError.value = '';

  // Pre-fill volume mounts from pack labels
  form.volumeMounts = extractVolumeMounts(props.app.pack);

  // Load nodes
  try {
    const api = createStarkAPI();
    const result = (await api.node.list()) as {
      nodes: Array<{ id: string; name: string; runtimeType: string; status: string }>;
    };
    nodes.value = result.nodes ?? [];
  } catch { nodes.value = []; }

  // Pre-fill browser node for browser packs
  const browserNodeId = getBrowserNodeId();
  if (browserNodeId && props.app.category !== 'node') {
    form.nodeId = browserNodeId;
  }

  // Check for dynamic service
  if (hasServiceLabel(props.app.pack) && props.app.pack.id) {
    try {
      const svcs = await fetchDynamicServicesForPack(props.app.pack.id);
      if (svcs.length === 1) {
        dynamicServiceName.value = svcs[0].name;
        dynamicServiceId.value = svcs[0].id;
      } else if (svcs.length > 1) {
        // Use the first one as default; user can see it
        dynamicServiceName.value = svcs[0].name;
        dynamicServiceId.value = svcs[0].id;
      }
    } catch { /* ignore */ }
  }
});

/* ── Helpers ── */
function addVolumeMount() { form.volumeMounts.push({ name: '', mountPath: '' }); }
function addLabel() { form.labels.push({ key: '', value: '' }); }
function addAnnotation() { form.annotations.push({ key: '', value: '' }); }
function addToleration() { form.tolerations.push({ key: '', operator: 'Equal', value: '', effect: '' }); }
function addNodeSelector() { form.nodeSelector.push({ key: '', value: '' }); }

function onNamespaceChange() {
  namespaceError.value = validateNamespace(form.namespace, userInfo.value);
}

function cancel() {
  emit('cancel');
  emit('update:visible', false);
}

function kvToRecord(arr: KV[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (const kv of arr) {
    if (kv.key.trim()) r[kv.key.trim()] = kv.value;
  }
  return r;
}

async function run() {
  if (!props.app || launching.value) return;
  launching.value = true;

  try {
    const api = createStarkAPI();
    const opts: Record<string, unknown> = {};

    if (form.nodeId) opts.nodeId = form.nodeId;
    if (form.namespace && form.namespace !== 'default') opts.namespace = form.namespace;

    const labels = kvToRecord(form.labels);
    if (Object.keys(labels).length > 0) opts.labels = labels;

    const annotations = kvToRecord(form.annotations);
    if (Object.keys(annotations).length > 0) opts.annotations = annotations;

    if (form.priorityClassName) opts.priorityClassName = form.priorityClassName;

    const tols = form.tolerations
      .filter((t) => t.key.trim())
      .map((t) => ({
        key: t.key.trim(),
        operator: t.operator as 'Equal' | 'Exists',
        value: t.operator === 'Exists' ? undefined : t.value,
        effect: t.effect || undefined,
      }));
    if (tols.length > 0) opts.tolerations = tols;

    if (form.resourceRequests.cpu || form.resourceRequests.memory) {
      opts.resourceRequests = { ...form.resourceRequests };
    }
    if (form.resourceLimits.cpu || form.resourceLimits.memory) {
      opts.resourceLimits = { ...form.resourceLimits };
    }

    const vols = form.volumeMounts.filter((v) => v.name.trim() && v.mountPath.trim());
    if (vols.length > 0) opts.volumeMounts = vols;

    const nodeSelectors = kvToRecord(form.nodeSelector);
    if (Object.keys(nodeSelectors).length > 0) {
      opts.scheduling = { nodeSelector: nodeSelectors };
    }

    const args = argsText.value.split('\n').map((a) => a.trim()).filter(Boolean);
    if (args.length > 0) opts.args = args;

    try {
      const md = JSON.parse(metadataJson.value);
      if (md && typeof md === 'object' && Object.keys(md).length > 0) opts.metadata = md;
    } catch { /* invalid JSON, skip */ }

    if (dynamicServiceId.value) {
      opts.serviceId = dynamicServiceId.value;
    }

    await api.pod.create(props.app.pack.name, opts);
    emit('launched');
    emit('update:visible', false);
  } catch (err: unknown) {
    console.error('RunPodDialog: Failed to launch:', err);
    alert(`Failed to run ${appName.value}: ${err instanceof Error ? err.message : 'Unknown error'}`);
  } finally {
    launching.value = false;
  }
}
</script>

<style scoped>
.rpd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.rpd-dialog {
  background: linear-gradient(180deg, #0f172a 0%, #1a2332 100%);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 12px;
  width: 520px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.rpd-header {
  display: flex;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.rpd-title {
  flex: 1;
  font-size: 0.95rem;
  font-weight: 600;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rpd-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.4rem;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.rpd-close-btn:hover { color: #e2e8f0; }

/* ── Sections ── */
.rpd-section {
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.rpd-collapsible {
  cursor: default;
}
.rpd-collapsible > summary {
  list-style: none;
}
.rpd-collapsible > summary::-webkit-details-marker { display: none; }
.rpd-collapsible > summary::before {
  content: '▸ ';
  color: #64748b;
}
.rpd-collapsible[open] > summary::before {
  content: '▾ ';
}

.rpd-section-title {
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

.rpd-clickable { cursor: pointer; }

.rpd-section-icon { font-size: 0.9rem; }

.rpd-subsection {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.rpd-subsection-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Scrollable body ── */
.rpd-dialog {
  overflow-y: auto;
}
.rpd-dialog::-webkit-scrollbar { width: 5px; }
.rpd-dialog::-webkit-scrollbar-track { background: transparent; }
.rpd-dialog::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 3px; }

/* ── Fields ── */
.rpd-field {
  margin-bottom: 10px;
  position: relative;
}

.rpd-field-row {
  display: flex;
  gap: 12px;
}

.rpd-field-half { flex: 1; }

.rpd-label {
  display: block;
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 4px;
  position: relative;
  cursor: default;
}

.rpd-hint {
  font-size: 0.65rem;
  color: #475569;
  cursor: help;
  margin-left: 2px;
}

.rpd-tooltip {
  display: none;
  position: absolute;
  left: 0;
  top: 100%;
  background: #1e293b;
  border: 1px solid rgba(59, 130, 246, 0.3);
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

.rpd-label:hover .rpd-tooltip { display: block; }

.rpd-tooltip-block {
  font-size: 0.68rem;
  color: #475569;
  margin: -6px 0 8px;
  line-height: 1.4;
}

.rpd-input, .rpd-select, .rpd-textarea {
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
.rpd-input:focus, .rpd-select:focus, .rpd-textarea:focus {
  border-color: rgba(59, 130, 246, 0.5);
}
.rpd-input::placeholder, .rpd-textarea::placeholder { color: #475569; }
.rpd-readonly { opacity: 0.7; cursor: not-allowed; }

.rpd-select { cursor: pointer; }
.rpd-select option { background: #1e293b; color: #e2e8f0; }

.rpd-textarea { resize: vertical; min-height: 40px; }

.rpd-input-half { flex: 1; }

/* ── Lists ── */
.rpd-list {
  max-height: 120px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 4px;
}
.rpd-list::-webkit-scrollbar { width: 3px; }
.rpd-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 2px; }

.rpd-list-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 4px;
}
.rpd-list-row:last-child { margin-bottom: 0; }

.rpd-list-row-wide { flex-wrap: wrap; }

.rpd-list-row .rpd-input,
.rpd-list-row .rpd-select {
  padding: 5px 8px;
  font-size: 0.78rem;
}

.rpd-add-btn {
  margin-left: auto;
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.68rem;
  cursor: pointer;
  transition: background 0.15s;
}
.rpd-add-btn:hover { background: rgba(59, 130, 246, 0.25); }

.rpd-remove-btn {
  background: none;
  border: none;
  color: #f87171;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0 4px;
  flex-shrink: 0;
  line-height: 1;
}
.rpd-remove-btn:hover { color: #fca5a5; }

.rpd-empty-list {
  font-size: 0.72rem;
  color: #475569;
  padding: 4px 0;
}

.rpd-field-error {
  font-size: 0.7rem;
  color: #f87171;
  margin-top: 3px;
  line-height: 1.3;
}

/* ── Actions ── */
.rpd-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.15);
}

.rpd-btn {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.rpd-btn-cancel {
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  border-color: rgba(255, 255, 255, 0.1);
}
.rpd-btn-cancel:hover { background: rgba(255, 255, 255, 0.1); color: #e2e8f0; }

.rpd-btn-run {
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  color: #fff;
  border-color: rgba(59, 130, 246, 0.5);
}
.rpd-btn-run:hover { background: linear-gradient(135deg, #1d4ed8, #2563eb); }
.rpd-btn-run:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
