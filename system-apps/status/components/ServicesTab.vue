<template>
  <div class="services-tab">
    <!-- Refreshing indicator -->
    <div v-if="refreshing && hasData" class="refresh-dot" title="Updating…">
      <ProgressSpinner style="width: 12px; height: 12px" strokeWidth="6" />
    </div>

    <!-- Initial loading state -->
    <div v-if="!hasData && refreshing" class="state-msg">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
      <span>Loading services…</span>
    </div>

    <!-- Error state -->
    <div v-else-if="!hasData && errorMsg" class="state-msg error">
      <span>{{ errorMsg }}</span>
      <Button label="Retry" severity="secondary" size="small" @click="refresh" />
    </div>

    <!-- Empty state -->
    <div v-else-if="hasData && allRows.length === 0" class="state-msg">
      No services found.
    </div>

    <!-- Services grouped by namespace -->
    <DataTable
      v-else-if="hasData"
      :value="allRows"
      rowGroupMode="subheader"
      groupRowsBy="namespace"
      sortField="namespace"
      :sortOrder="1"
      expandableRowGroups
      v-model:expandedRowGroups="expandedGroups"
      scrollable
      scrollHeight="flex"
      :rowHover="true"
      stripedRows
      class="services-table"
    >
      <template #groupheader="{ data }">
        <div class="group-header">
          <span class="ns-icon">📁</span>
          <span class="ns-name">{{ data.namespace }}</span>
          <Tag :value="`${namespaceCounts[data.namespace] ?? 0} service${(namespaceCounts[data.namespace] ?? 0) !== 1 ? 's' : ''}`" severity="info" />
        </div>
      </template>

      <Column field="name" header="Name" sortable style="min-width: 120px">
        <template #body="{ data }">
          <div class="service-name-cell">
            <span class="service-name">{{ data.name }}</span>
            <Tag :value="data.status" :severity="statusSeverity(data.status)" class="service-status-tag" />
          </div>
        </template>
      </Column>
      <Column field="mode" header="Mode" sortable class="hide-on-mobile" style="min-width: 80px">
        <template #body="{ data }">
          <Tag :value="data.mode" severity="secondary" />
        </template>
      </Column>
      <Column field="replicas" header="Replicas" sortable class="hide-on-mobile" style="min-width: 70px" />
      <Column field="ingressPort" header="Ingress" sortable style="min-width: 80px">
        <template #body="{ data }">
          <span v-if="data.ingressPort" class="mono ingress-badge">:{{ data.ingressPort }}</span>
          <span v-else class="muted-text">—</span>
        </template>
      </Column>
      <Column field="visibility" header="Visibility" class="hide-on-mobile" sortable style="min-width: 80px">
        <template #body="{ data }">
          <Tag :value="data.visibility" :severity="visibilitySeverity(data.visibility)" />
        </template>
      </Column>
      <Column field="volumeNames" header="Volumes" class="hide-on-mobile" style="min-width: 100px">
        <template #body="{ data }">
          <div v-if="data.volumeNames.length > 0" class="volume-list">
            <Tag v-for="v in data.volumeNames" :key="v" :value="v" severity="secondary" class="volume-tag" />
          </div>
          <span v-else class="muted-text">—</span>
        </template>
      </Column>
      <Column header="Actions" style="min-width: 120px">
        <template #body="{ data }">
          <div class="action-btns">
            <Button
              icon="pi pi-trash"
              severity="danger"
              size="small"
              text
              :loading="deletingServices.has(data.id)"
              @click="deleteService(data.id, data.name)"
              title="Delete service"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- Volumes section -->
    <div v-if="hasData && volumes.length > 0" class="volumes-section">
      <div class="section-header">
        <span>💾 Volumes</span>
        <span class="section-count">{{ volumes.length }}</span>
      </div>
      <div class="volumes-grid">
        <div v-for="vol in volumes" :key="vol.id" class="volume-card">
          <div class="volume-card-header">
            <span class="volume-card-name">{{ vol.name }}</span>
            <Button
              icon="pi pi-trash"
              severity="danger"
              size="small"
              text
              :loading="deletingVolumes.has(vol.id)"
              @click="deleteVolume(vol.id, vol.name)"
              title="Delete volume"
            />
          </div>
          <div class="volume-card-details">
            <span class="volume-detail"><span class="volume-label">Namespace:</span> {{ vol.namespace ?? 'default' }}</span>
            <span class="volume-detail"><span class="volume-label">Node:</span> {{ vol.nodeName ?? vol.nodeId ?? '—' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useStarkApi } from '../composables/useStarkApi';

/* ── Types ── */

interface ServiceData {
  id: string;
  name: string;
  namespace: string;
  status: string;
  mode: string;
  replicas: number;
  ingressPort?: number;
  visibility: string;
  exposed: boolean;
  packId?: string;
  packVersion?: string;
  nodeId?: string;
  volumeMounts?: Array<{ name: string; mountPath: string }>;
}

interface VolumeData {
  id: string;
  name: string;
  namespace?: string;
  nodeId?: string;
  nodeName?: string;
}

interface NodeData {
  id: string;
  name: string;
}

interface ServiceRow {
  id: string;
  name: string;
  namespace: string;
  status: string;
  mode: string;
  replicas: number;
  ingressPort: number | null;
  visibility: string;
  volumeNames: string[];
}

/* ── State ── */

const refreshing = ref(false);
const hasData = ref(false);
const errorMsg = ref('');
const allRows = ref<ServiceRow[]>([]);
const volumes = ref<VolumeData[]>([]);
const expandedGroups = ref<string[]>([]);
const deletingServices = ref<Set<string>>(new Set());
const deletingVolumes = ref<Set<string>>(new Set());
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

const api = useStarkApi();
const toast = useToast();

const namespaceCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const row of allRows.value) {
    counts[row.namespace] = (counts[row.namespace] ?? 0) + 1;
  }
  return counts;
});

/* ── Helpers ── */

function statusSeverity(status: string): string {
  switch (status) {
    case 'active': return 'success';
    case 'paused': return 'warn';
    case 'scaling': return 'info';
    case 'deleting': return 'danger';
    default: return 'secondary';
  }
}

function visibilitySeverity(visibility: string): string {
  switch (visibility) {
    case 'public': return 'success';
    case 'private': return 'warn';
    case 'system': return 'secondary';
    default: return 'secondary';
  }
}

/* ── Data loading ── */

async function refresh() {
  refreshing.value = true;
  errorMsg.value = '';

  try {
    const [serviceResult, volumeResult, nodeResult] = await Promise.all([
      api.service.list() as Promise<{ services: ServiceData[] }>,
      api.volume.list() as Promise<{ volumes: VolumeData[] }>,
      api.node.list() as Promise<{ nodes: NodeData[] }>,
    ]);

    const services: ServiceData[] = serviceResult.services ?? [];
    const vols: VolumeData[] = volumeResult.volumes ?? [];
    const nodes: NodeData[] = nodeResult.nodes ?? [];

    const nodeMap = new Map<string, string>();
    for (const n of nodes) nodeMap.set(n.id, n.name);

    // Enrich volumes with node names
    volumes.value = vols.map((v) => ({
      ...v,
      nodeName: v.nodeId ? (nodeMap.get(v.nodeId) ?? v.nodeId) : undefined,
    }));

    const rows: ServiceRow[] = services.map((s) => ({
      id: s.id,
      name: s.name,
      namespace: s.namespace ?? 'default',
      status: s.status,
      mode: s.mode,
      replicas: s.replicas,
      ingressPort: s.ingressPort ?? null,
      visibility: s.visibility ?? 'private',
      volumeNames: (s.volumeMounts ?? []).map((vm) => vm.name),
    }));

    allRows.value = rows;

    // Auto-expand on first load
    if (!hasData.value) {
      expandedGroups.value = [...new Set(rows.map((r) => r.namespace))];
    }

    hasData.value = true;
  } catch (err: unknown) {
    console.error('Failed to load services:', err);
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load services';
  } finally {
    refreshing.value = false;
  }
}

async function deleteService(id: string, name: string) {
  deletingServices.value.add(id);
  try {
    await api.service.delete(id);
    toast.add({ severity: 'success', summary: 'Service Deleted', detail: `Service "${name}" has been removed`, life: 5000 });
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to delete service:', err);
    toast.add({ severity: 'error', summary: 'Delete Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    deletingServices.value.delete(id);
  }
}

async function deleteVolume(id: string, name: string) {
  deletingVolumes.value.add(id);
  try {
    await api.volume.delete(id);
    toast.add({ severity: 'success', summary: 'Volume Deleted', detail: `Volume "${name}" has been removed`, life: 5000 });
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to delete volume:', err);
    toast.add({ severity: 'error', summary: 'Delete Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    deletingVolumes.value.delete(id);
  }
}

onMounted(() => {
  refresh();
  refreshIntervalId = setInterval(refresh, 10000);
});

onBeforeUnmount(() => {
  if (refreshIntervalId !== null) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
});
</script>

<style scoped>
.services-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.refresh-dot {
  position: absolute;
  top: 6px;
  right: 10px;
  z-index: 10;
  opacity: 0.5;
}

.state-msg {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px;
  color: #94a3b8;
  flex: 1;
}
.state-msg.error {
  flex-direction: column;
  color: #f87171;
}

.services-table {
  flex: 1;
  min-height: 0;
}

/* ── Group header ── */
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.08) 0%, transparent 100%);
  border-left: 3px solid #22c55e;
}

.ns-icon {
  font-size: 0.9rem;
}

.ns-name {
  font-weight: 600;
  color: #e2e8f0;
}

/* ── Service cells ── */
.service-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.service-name {
  font-weight: 600;
  color: #e2e8f0;
}

.service-status-tag {
  font-size: 0.65rem;
}

.mono {
  font-family: 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace;
  font-size: 0.9em;
}

.ingress-badge {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.muted-text {
  color: #475569;
}

.volume-list {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.volume-tag {
  font-size: 0.65rem;
}

.action-btns {
  display: flex;
  gap: 4px;
}

/* ── Volumes section ── */
.volumes-section {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 12px;
  flex-shrink: 0;
  max-height: 200px;
  overflow-y: auto;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 10px;
}

.section-count {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border-radius: 10px;
  padding: 1px 8px;
  font-size: 0.75rem;
}

.volumes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.volume-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 8px 10px;
}

.volume-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.volume-card-name {
  font-weight: 600;
  color: #e2e8f0;
  font-size: 0.85rem;
}

.volume-card-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}

.volume-detail {
  font-size: 0.75rem;
  color: #94a3b8;
}

.volume-label {
  color: #64748b;
}

/* ── Mobile responsive ── */
@media (max-width: 640px) {
  :deep(.hide-on-mobile) {
    display: none !important;
  }

  .volumes-grid {
    grid-template-columns: 1fr;
  }

  .group-header {
    gap: 4px;
    padding: 6px 8px;
  }
}
</style>
