<template>
  <div v-if="visible" class="isd-overlay" @click.self="cancel" @keydown.escape="cancel">
    <div class="isd-dialog" @click.stop>
      <!-- Header -->
      <div class="isd-header">
        <span class="isd-title">Install Service — "{{ appName }}"</span>
        <button class="isd-close-btn" title="Close" @click="cancel">&times;</button>
      </div>

      <!-- Basic options -->
      <div class="isd-section">
        <div class="isd-section-title">
          <span class="isd-section-icon">⚙️</span> Basic Options
        </div>
        <div class="isd-field">
          <label class="isd-label" title="Unique name for this service within its namespace">
            Service Name
            <span class="isd-hint">ⓘ</span>
            <span class="isd-tooltip">A unique name identifying this service. Must be unique within the namespace.</span>
          </label>
          <input v-model="form.name" class="isd-input" type="text" :placeholder="appName + '-svc'" />
        </div>

        <div class="isd-field-row">
          <div class="isd-field isd-field-half">
            <label class="isd-label" title="Scheduling mode determines how pods are managed">
              Mode
              <span class="isd-hint">ⓘ</span>
              <span class="isd-tooltip">replica: maintain N pods. daemon: one pod per eligible node. dynamic: pods created on-demand, no auto-reconciliation.</span>
            </label>
            <select v-model="form.mode" class="isd-select">
              <option value="replica">Replica</option>
              <option value="daemon">Daemon (one per node)</option>
              <option value="dynamic">Dynamic (on-demand)</option>
            </select>
          </div>
          <div class="isd-field isd-field-half">
            <label class="isd-label" title="Number of pod replicas (only for replica mode)">
              Replicas
              <span class="isd-hint">ⓘ</span>
              <span class="isd-tooltip">Target number of running pods. Only used in 'replica' mode. Daemon mode runs one per node; dynamic mode ignores this.</span>
            </label>
            <input v-model.number="form.replicas" class="isd-input" type="number" min="0" :disabled="form.mode !== 'replica'" placeholder="1" />
          </div>
        </div>

        <div class="isd-field">
          <label class="isd-label" title="Namespace for resource isolation">
            Namespace
            <span class="isd-hint">ⓘ</span>
            <span class="isd-tooltip">Logical grouping for isolation. Services and their pods share the same namespace.</span>
          </label>
          <input v-model="form.namespace" class="isd-input" type="text" placeholder="default" @input="onNamespaceChange" />
          <div v-if="namespaceError" class="isd-field-error">{{ namespaceError }}</div>
        </div>

        <div class="isd-field">
          <label class="isd-label" title="Pin all replicas to a specific node (required for volumes)">
            Target Node
            <span class="isd-hint">ⓘ</span>
            <span class="isd-tooltip">When set, all pods run on this node. Required when volume mounts are specified since volumes are node-local.</span>
          </label>
          <select v-model="form.nodeId" class="isd-select">
            <option value="">Auto (scheduler decides)</option>
            <option v-for="n in onlineNodes" :key="n.id" :value="n.id">
              {{ n.name }} ({{ n.runtimeType }}, {{ n.status }})
            </option>
          </select>
        </div>

        <div class="isd-field-row">
          <div class="isd-field isd-field-half">
            <label class="isd-label" title="Automatically update to the latest pack version">
              Follow Latest
              <span class="isd-hint">ⓘ</span>
              <span class="isd-tooltip">When enabled, pods are automatically updated when a new version of the pack is registered.</span>
            </label>
            <select v-model="form.followLatest" class="isd-select">
              <option :value="true">Yes</option>
              <option :value="false">No</option>
            </select>
          </div>
          <div class="isd-field isd-field-half">
            <label class="isd-label" title="Specific pack version to deploy">
              Pack Version
              <span class="isd-hint">ⓘ</span>
              <span class="isd-tooltip">Pin to a specific semantic version. Leave empty for latest. Ignored when Follow Latest is enabled.</span>
            </label>
            <input v-model="form.packVersion" class="isd-input" type="text" placeholder="latest" :disabled="form.followLatest" />
          </div>
        </div>

        <div class="isd-field">
          <label class="isd-label" title="Arguments passed to each pod's entrypoint">
            Arguments
            <span class="isd-hint">ⓘ</span>
            <span class="isd-tooltip">Arguments passed to every pod created by this service. One argument per line.</span>
          </label>
          <textarea v-model="argsText" class="isd-textarea" rows="2" placeholder="One argument per line" />
        </div>
      </div>

      <!-- Labels -->
      <div class="isd-section">
        <div class="isd-section-title">
          <span class="isd-section-icon">🏷️</span> Service Labels
          <button class="isd-add-btn" title="Add label" @click="addLabel">+ Add</button>
        </div>
        <div class="isd-tooltip-block">Key-value pairs on the service itself for organization and selection.</div>
        <div v-if="form.labels.length === 0" class="isd-empty-list">No service labels.</div>
        <div v-else class="isd-list">
          <div v-for="(lbl, i) in form.labels" :key="i" class="isd-list-row">
            <input v-model="lbl.key" class="isd-input isd-input-half" placeholder="Key" />
            <input v-model="lbl.value" class="isd-input isd-input-half" placeholder="Value" />
            <button class="isd-remove-btn" title="Remove" @click="form.labels.splice(i, 1)">×</button>
          </div>
        </div>
      </div>

      <!-- Pod Labels -->
      <div class="isd-section">
        <div class="isd-section-title">
          <span class="isd-section-icon">📎</span> Pod Labels
          <button class="isd-add-btn" title="Add pod label" @click="addPodLabel">+ Add</button>
        </div>
        <div class="isd-tooltip-block">Labels applied to every pod created by this service. Use "start:" prefix for start-menu grouping.</div>
        <div v-if="form.podLabels.length === 0" class="isd-empty-list">No pod labels.</div>
        <div v-else class="isd-list">
          <div v-for="(lbl, i) in form.podLabels" :key="i" class="isd-list-row">
            <input v-model="lbl.key" class="isd-input isd-input-half" placeholder="Key" />
            <input v-model="lbl.value" class="isd-input isd-input-half" placeholder="Value" />
            <button class="isd-remove-btn" title="Remove" @click="form.podLabels.splice(i, 1)">×</button>
          </div>
        </div>
      </div>

      <!-- Volume Mounts -->
      <div class="isd-section">
        <div class="isd-section-title">
          <span class="isd-section-icon">💾</span> Volume Mounts
          <button class="isd-add-btn" title="Add volume mount" @click="addVolumeMount">+ Add</button>
        </div>
        <div class="isd-tooltip-block">Persistent storage for pods. Requires a target node since volumes are node-local.</div>
        <div v-if="form.volumeMounts.length === 0" class="isd-empty-list">No volume mounts.</div>
        <div v-else class="isd-list">
          <div v-for="(vm, i) in form.volumeMounts" :key="i" class="isd-list-row">
            <input v-model="vm.name" class="isd-input isd-input-half" placeholder="Volume name" />
            <input v-model="vm.mountPath" class="isd-input isd-input-half" placeholder="/mount/path" />
            <button class="isd-remove-btn" title="Remove" @click="form.volumeMounts.splice(i, 1)">×</button>
          </div>
        </div>
      </div>

      <!-- Network / Visibility (collapsible) -->
      <details class="isd-section isd-collapsible">
        <summary class="isd-section-title isd-clickable">
          <span class="isd-section-icon">🌐</span> Network &amp; Visibility
        </summary>
        <div class="isd-field-row">
          <div class="isd-field isd-field-half">
            <label class="isd-label" title="Controls internal service-to-service access">
              Visibility
              <span class="isd-hint">ⓘ</span>
              <span class="isd-tooltip">public: internal traffic allowed. private: denied unless in allowedSources. system: same as private, admin-level.</span>
            </label>
            <select v-model="form.visibility" class="isd-select">
              <option value="private">Private</option>
              <option value="public">Public</option>
              <option value="system">System</option>
            </select>
          </div>
          <div class="isd-field isd-field-half">
            <label class="isd-label" title="Whether this service is reachable from external ingress">
              Exposed
              <span class="isd-hint">ⓘ</span>
              <span class="isd-tooltip">When enabled, the service is reachable from external HTTP traffic via the ingress port.</span>
            </label>
            <select v-model="form.exposed" class="isd-select">
              <option :value="false">No</option>
              <option :value="true">Yes</option>
            </select>
          </div>
        </div>
        <div class="isd-field">
          <label class="isd-label" title="Port on the orchestrator for incoming HTTP traffic">
            Ingress Port
            <span class="isd-hint">ⓘ</span>
            <span class="isd-tooltip">The orchestrator opens an HTTP listener on this port and proxies requests to a healthy pod. Leave empty for no ingress.</span>
          </label>
          <input v-model.number="form.ingressPort" class="isd-input" type="number" min="0" placeholder="(none)" />
        </div>
        <div class="isd-field">
          <label class="isd-label" title="Enable ephemeral data plane for transient pod communication">
            Ephemeral Data Plane
            <span class="isd-hint">ⓘ</span>
            <span class="isd-tooltip">When enabled, each pod receives an EphemeralDataPlane instance for transient group membership, fan-out queries, and presence tracking.</span>
          </label>
          <select v-model="form.enableEphemeral" class="isd-select">
            <option :value="false">Disabled</option>
            <option :value="true">Enabled</option>
          </select>
        </div>
      </details>

      <!-- Performance (collapsible) -->
      <details class="isd-section isd-collapsible">
        <summary class="isd-section-title isd-clickable">
          <span class="isd-section-icon">📊</span> Performance &amp; Resources
        </summary>
        <div class="isd-field-row">
          <div class="isd-field isd-field-half">
            <label class="isd-label">
              CPU Request (mc)
              <span class="isd-hint">ⓘ</span>
              <span class="isd-tooltip">Minimum CPU in millicores reserved per pod.</span>
            </label>
            <input v-model.number="form.resourceRequests.cpu" class="isd-input" type="number" min="0" step="50" placeholder="100" />
          </div>
          <div class="isd-field isd-field-half">
            <label class="isd-label">
              CPU Limit (mc)
              <span class="isd-hint">ⓘ</span>
              <span class="isd-tooltip">Maximum CPU each pod can consume.</span>
            </label>
            <input v-model.number="form.resourceLimits.cpu" class="isd-input" type="number" min="0" step="50" placeholder="500" />
          </div>
        </div>
        <div class="isd-field-row">
          <div class="isd-field isd-field-half">
            <label class="isd-label">
              Memory Request (MB)
              <span class="isd-hint">ⓘ</span>
              <span class="isd-tooltip">Minimum memory reserved per pod.</span>
            </label>
            <input v-model.number="form.resourceRequests.memory" class="isd-input" type="number" min="0" step="32" placeholder="128" />
          </div>
          <div class="isd-field isd-field-half">
            <label class="isd-label">
              Memory Limit (MB)
              <span class="isd-hint">ⓘ</span>
              <span class="isd-tooltip">Maximum memory per pod. Exceeding causes OOM termination.</span>
            </label>
            <input v-model.number="form.resourceLimits.memory" class="isd-input" type="number" min="0" step="32" placeholder="512" />
          </div>
        </div>
        <div class="isd-field">
          <label class="isd-label">
            Priority Class
            <span class="isd-hint">ⓘ</span>
            <span class="isd-tooltip">Named priority class for scheduling order and preemption.</span>
          </label>
          <input v-model="form.priorityClassName" class="isd-input" type="text" placeholder="(none)" />
        </div>
      </details>

      <!-- Advanced (collapsible) -->
      <details class="isd-section isd-collapsible">
        <summary class="isd-section-title isd-clickable">
          <span class="isd-section-icon">🔧</span> Advanced Options
        </summary>

        <!-- Annotations -->
        <div class="isd-subsection">
          <div class="isd-subsection-title">
            Annotations
            <button class="isd-add-btn" title="Add annotation" @click="addAnnotation">+ Add</button>
          </div>
          <div v-if="form.annotations.length === 0" class="isd-empty-list">No annotations.</div>
          <div v-else class="isd-list">
            <div v-for="(ann, i) in form.annotations" :key="i" class="isd-list-row">
              <input v-model="ann.key" class="isd-input isd-input-half" placeholder="Key" />
              <input v-model="ann.value" class="isd-input isd-input-half" placeholder="Value" />
              <button class="isd-remove-btn" title="Remove" @click="form.annotations.splice(i, 1)">×</button>
            </div>
          </div>
        </div>

        <!-- Pod Annotations -->
        <div class="isd-subsection">
          <div class="isd-subsection-title">
            Pod Annotations
            <button class="isd-add-btn" title="Add pod annotation" @click="addPodAnnotation">+ Add</button>
          </div>
          <div v-if="form.podAnnotations.length === 0" class="isd-empty-list">No pod annotations.</div>
          <div v-else class="isd-list">
            <div v-for="(ann, i) in form.podAnnotations" :key="i" class="isd-list-row">
              <input v-model="ann.key" class="isd-input isd-input-half" placeholder="Key" />
              <input v-model="ann.value" class="isd-input isd-input-half" placeholder="Value" />
              <button class="isd-remove-btn" title="Remove" @click="form.podAnnotations.splice(i, 1)">×</button>
            </div>
          </div>
        </div>

        <!-- Tolerations -->
        <div class="isd-subsection">
          <div class="isd-subsection-title">
            Tolerations
            <button class="isd-add-btn" title="Add toleration" @click="addToleration">+ Add</button>
          </div>
          <div v-if="form.tolerations.length === 0" class="isd-empty-list">No tolerations.</div>
          <div v-else class="isd-list">
            <div v-for="(tol, i) in form.tolerations" :key="i" class="isd-list-row isd-list-row-wide">
              <input v-model="tol.key" class="isd-input" placeholder="Key" style="flex:2" />
              <select v-model="tol.operator" class="isd-select" style="flex:1">
                <option value="Equal">Equal</option>
                <option value="Exists">Exists</option>
              </select>
              <input v-model="tol.value" class="isd-input" placeholder="Value" style="flex:2" :disabled="tol.operator === 'Exists'" />
              <select v-model="tol.effect" class="isd-select" style="flex:1.5">
                <option value="">Any</option>
                <option value="NoSchedule">NoSchedule</option>
                <option value="PreferNoSchedule">PreferNoSchedule</option>
                <option value="NoExecute">NoExecute</option>
              </select>
              <button class="isd-remove-btn" title="Remove" @click="form.tolerations.splice(i, 1)">×</button>
            </div>
          </div>
        </div>

        <!-- Secrets -->
        <div class="isd-subsection">
          <div class="isd-subsection-title">
            Secrets
            <button class="isd-add-btn" title="Add secret" @click="addSecret">+ Add</button>
          </div>
          <div class="isd-tooltip-block">Secret names to attach to this service's pods. Each secret must exist in the same namespace.</div>
          <div v-if="form.secrets.length === 0" class="isd-empty-list">No secrets.</div>
          <div v-else class="isd-list">
            <div v-for="(sec, i) in form.secrets" :key="i" class="isd-list-row">
              <input v-model="form.secrets[i]" class="isd-input" placeholder="Secret name" />
              <button class="isd-remove-btn" title="Remove" @click="form.secrets.splice(i, 1)">×</button>
            </div>
          </div>
        </div>

        <!-- Allowed Sources -->
        <div class="isd-subsection">
          <div class="isd-subsection-title">
            Allowed Sources
            <button class="isd-add-btn" title="Add source" @click="addAllowedSource">+ Add</button>
          </div>
          <div class="isd-tooltip-block">Service IDs allowed to call this service internally. Only relevant for private/system visibility.</div>
          <div v-if="form.allowedSources.length === 0" class="isd-empty-list">No allowed sources.</div>
          <div v-else class="isd-list">
            <div v-for="(src, i) in form.allowedSources" :key="i" class="isd-list-row">
              <input v-model="form.allowedSources[i]" class="isd-input" placeholder="Service ID" />
              <button class="isd-remove-btn" title="Remove" @click="form.allowedSources.splice(i, 1)">×</button>
            </div>
          </div>
        </div>

        <div class="isd-field">
          <label class="isd-label">
            Metadata (JSON)
            <span class="isd-hint">ⓘ</span>
            <span class="isd-tooltip">Arbitrary JSON metadata stored with the service record.</span>
          </label>
          <textarea v-model="metadataJson" class="isd-textarea" rows="2" placeholder='{"key": "value"}' />
        </div>
      </details>

      <!-- Actions -->
      <div class="isd-actions">
        <button class="isd-btn isd-btn-cancel" @click="cancel">Cancel</button>
        <button class="isd-btn isd-btn-install" :disabled="installing || !form.name.trim() || !!namespaceError" @click="install">
          {{ installing ? 'Installing…' : '📦 Install Service' }}
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
  fetchUserInfo,
  validateNamespace,
  type AppEntry,
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
  (e: 'installed'): void;
  (e: 'update:visible', val: boolean): void;
}>();

/* ── Types ── */
interface KV { key: string; value: string }
interface TolEntry { key: string; operator: string; value: string; effect: string }

/* ── State ── */
const installing = ref(false);
const nodes = ref<Array<{ id: string; name: string; runtimeType: string; status: string }>>([]);
const userInfo = ref<UserInfo>({ email: '', userId: '', isAdmin: false, defaultNamespace: 'default' });
const namespaceError = ref('');

const form = reactive({
  name: '',
  mode: 'replica' as 'replica' | 'daemon' | 'dynamic',
  replicas: 1,
  namespace: 'default',
  nodeId: '',
  followLatest: true,
  packVersion: '',
  labels: [] as KV[],
  annotations: [] as KV[],
  podLabels: [] as KV[],
  podAnnotations: [] as KV[],
  priorityClassName: '',
  tolerations: [] as TolEntry[],
  resourceRequests: { cpu: 100, memory: 128 },
  resourceLimits: { cpu: 500, memory: 512 },
  volumeMounts: [] as Array<{ name: string; mountPath: string }>,
  ingressPort: null as number | null,
  visibility: 'private' as 'public' | 'private' | 'system',
  exposed: false,
  enableEphemeral: false,
  allowedSources: [] as string[],
  secrets: [] as string[],
  args: [] as string[],
});

const argsText = ref('');
const metadataJson = ref('{}');

/* ── Computed ── */
const appName = computed(() => props.app?.name ?? '');

const onlineNodes = computed(() => nodes.value.filter((n) => n.status === 'online'));

/* ── Watchers ── */
watch(() => props.visible, async (val) => {
  if (!val || !props.app) return;

  // Fetch user info for namespace defaulting
  userInfo.value = await fetchUserInfo();

  // Reset
  form.name = props.app.name + '-svc';
  form.mode = 'replica';
  form.replicas = 1;
  form.namespace = userInfo.value.defaultNamespace;
  form.nodeId = '';
  form.followLatest = true;
  form.packVersion = '';
  form.labels = [];
  form.annotations = [];
  form.podLabels = [];
  form.podAnnotations = [];
  form.priorityClassName = '';
  form.tolerations = [];
  form.resourceRequests = { cpu: 100, memory: 128 };
  form.resourceLimits = { cpu: 500, memory: 512 };
  form.ingressPort = null;
  form.visibility = 'private';
  form.exposed = false;
  form.enableEphemeral = false;
  form.allowedSources = [];
  form.secrets = [];
  form.args = [];
  argsText.value = '';
  metadataJson.value = '{}';
  installing.value = false;
  namespaceError.value = '';

  // Pre-fill volume mounts
  form.volumeMounts = extractVolumeMounts(props.app.pack);

  // Load nodes
  try {
    const api = createStarkAPI();
    const result = (await api.node.list()) as {
      nodes: Array<{ id: string; name: string; runtimeType: string; status: string }>;
    };
    nodes.value = result.nodes ?? [];
  } catch { nodes.value = []; }
});

/* ── Helpers ── */
function addLabel() { form.labels.push({ key: '', value: '' }); }
function addAnnotation() { form.annotations.push({ key: '', value: '' }); }
function addPodLabel() { form.podLabels.push({ key: '', value: '' }); }
function addPodAnnotation() { form.podAnnotations.push({ key: '', value: '' }); }
function addVolumeMount() { form.volumeMounts.push({ name: '', mountPath: '' }); }
function addToleration() { form.tolerations.push({ key: '', operator: 'Equal', value: '', effect: '' }); }
function addSecret() { form.secrets.push(''); }
function addAllowedSource() { form.allowedSources.push(''); }

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

async function install() {
  if (!props.app || installing.value || !form.name.trim()) return;
  installing.value = true;

  try {
    const api = createStarkAPI();
    const opts: Record<string, unknown> = {
      name: form.name.trim(),
      packName: props.app.pack.name,
      mode: form.mode,
    };

    if (form.mode === 'replica') opts.replicas = form.replicas;
    if (form.namespace && form.namespace !== 'default') opts.namespace = form.namespace;
    if (form.nodeId) opts.nodeId = form.nodeId;
    if (!form.followLatest) {
      opts.followLatest = false;
      if (form.packVersion) opts.packVersion = form.packVersion;
    }

    const labels = kvToRecord(form.labels);
    if (Object.keys(labels).length > 0) opts.labels = labels;

    const annotations = kvToRecord(form.annotations);
    if (Object.keys(annotations).length > 0) opts.annotations = annotations;

    const podLabels = kvToRecord(form.podLabels);
    if (Object.keys(podLabels).length > 0) opts.podLabels = podLabels;

    const podAnnotations = kvToRecord(form.podAnnotations);
    if (Object.keys(podAnnotations).length > 0) opts.podAnnotations = podAnnotations;

    if (form.priorityClassName) opts.priorityClassName = form.priorityClassName;

    const tols = form.tolerations
      .filter((t) => t.key.trim())
      .map((t) => ({
        key: t.key.trim(),
        operator: t.operator,
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

    if (form.ingressPort && form.ingressPort > 0) opts.ingressPort = form.ingressPort;
    if (form.visibility !== 'private') opts.visibility = form.visibility;
    if (form.exposed) opts.exposed = true;
    if (form.enableEphemeral) opts.enableEphemeral = true;

    const sources = form.allowedSources.filter((s) => s.trim());
    if (sources.length > 0) opts.allowedSources = sources;

    const secrets = form.secrets.filter((s) => s.trim());
    if (secrets.length > 0) opts.secrets = secrets;

    const args = argsText.value.split('\n').map((a) => a.trim()).filter(Boolean);
    if (args.length > 0) opts.args = args;

    try {
      const md = JSON.parse(metadataJson.value);
      if (md && typeof md === 'object' && Object.keys(md).length > 0) opts.metadata = md;
    } catch { /* skip invalid JSON */ }

    await api.service.create(opts);
    emit('installed');
    emit('update:visible', false);
  } catch (err: unknown) {
    console.error('InstallServiceDialog: Failed to install service:', err);
    alert(`Failed to install service: ${err instanceof Error ? err.message : 'Unknown error'}`);
  } finally {
    installing.value = false;
  }
}
</script>

<style scoped>
.isd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.isd-dialog {
  background: linear-gradient(180deg, #0f172a 0%, #1a2332 100%);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 12px;
  width: 540px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow-y: auto;
}
.isd-dialog::-webkit-scrollbar { width: 5px; }
.isd-dialog::-webkit-scrollbar-track { background: transparent; }
.isd-dialog::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 3px; }

.isd-header {
  display: flex;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.isd-title {
  flex: 1;
  font-size: 0.95rem;
  font-weight: 600;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.isd-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.4rem;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.isd-close-btn:hover { color: #e2e8f0; }

.isd-section {
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.isd-collapsible > summary { list-style: none; }
.isd-collapsible > summary::-webkit-details-marker { display: none; }
.isd-collapsible > summary::before { content: '▸ '; color: #64748b; }
.isd-collapsible[open] > summary::before { content: '▾ '; }

.isd-section-title {
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

.isd-clickable { cursor: pointer; }
.isd-section-icon { font-size: 0.9rem; }

.isd-subsection {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.isd-subsection-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.isd-field { margin-bottom: 10px; position: relative; }
.isd-field-row { display: flex; gap: 12px; }
.isd-field-half { flex: 1; }

.isd-label {
  display: block;
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 4px;
  position: relative;
  cursor: default;
}

.isd-hint {
  font-size: 0.65rem;
  color: #475569;
  cursor: help;
  margin-left: 2px;
}

.isd-tooltip {
  display: none;
  position: absolute;
  left: 0;
  top: 100%;
  background: #1e293b;
  border: 1px solid rgba(16, 185, 129, 0.3);
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
.isd-label:hover .isd-tooltip { display: block; }

.isd-tooltip-block {
  font-size: 0.68rem;
  color: #475569;
  margin: -6px 0 8px;
  line-height: 1.4;
}

.isd-input, .isd-select, .isd-textarea {
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
.isd-input:focus, .isd-select:focus, .isd-textarea:focus { border-color: rgba(16, 185, 129, 0.5); }
.isd-input::placeholder, .isd-textarea::placeholder { color: #475569; }
.isd-input:disabled { opacity: 0.5; }

.isd-select { cursor: pointer; }
.isd-select option { background: #1e293b; color: #e2e8f0; }
.isd-select:disabled { opacity: 0.5; cursor: not-allowed; }
.isd-textarea { resize: vertical; min-height: 40px; }
.isd-input-half { flex: 1; }

.isd-list {
  max-height: 120px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 4px;
}
.isd-list::-webkit-scrollbar { width: 3px; }
.isd-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 2px; }

.isd-list-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 4px;
}
.isd-list-row:last-child { margin-bottom: 0; }
.isd-list-row-wide { flex-wrap: wrap; }

.isd-list-row .isd-input,
.isd-list-row .isd-select {
  padding: 5px 8px;
  font-size: 0.78rem;
}

.isd-add-btn {
  margin-left: auto;
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.68rem;
  cursor: pointer;
  transition: background 0.15s;
}
.isd-add-btn:hover { background: rgba(16, 185, 129, 0.25); }

.isd-remove-btn {
  background: none;
  border: none;
  color: #f87171;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0 4px;
  flex-shrink: 0;
  line-height: 1;
}
.isd-remove-btn:hover { color: #fca5a5; }

.isd-empty-list {
  font-size: 0.72rem;
  color: #475569;
  padding: 4px 0;
}

.isd-field-error {
  font-size: 0.7rem;
  color: #f87171;
  margin-top: 3px;
  line-height: 1.3;
}

.isd-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.15);
}

.isd-btn {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.isd-btn-cancel {
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  border-color: rgba(255, 255, 255, 0.1);
}
.isd-btn-cancel:hover { background: rgba(255, 255, 255, 0.1); color: #e2e8f0; }

.isd-btn-install {
  background: linear-gradient(135deg, #059669, #10b981);
  color: #fff;
  border-color: rgba(16, 185, 129, 0.5);
}
.isd-btn-install:hover { background: linear-gradient(135deg, #047857, #059669); }
.isd-btn-install:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
