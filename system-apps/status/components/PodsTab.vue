<template>
  <div class="pods-tab">
    <!-- Refreshing indicator — subtle top bar, keeps data visible -->
    <div v-if="refreshing && hasData" class="refresh-bar">
      <ProgressSpinner style="width: 14px; height: 14px" strokeWidth="5" />
      <span>Updating…</span>
    </div>

    <!-- Initial loading state (no data yet) -->
    <div v-if="!hasData && refreshing" class="state-msg">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
      <span>Loading pods…</span>
    </div>

    <!-- Error state (no data yet) -->
    <div v-else-if="!hasData && errorMsg" class="state-msg error">
      <span>{{ errorMsg }}</span>
      <Button label="Retry" severity="secondary" size="small" @click="refresh" />
    </div>

    <!-- Empty state -->
    <div v-else-if="hasData && allPods.length === 0" class="state-msg">
      No pods found.
    </div>

    <!-- Grouped pod table -->
    <DataTable
      v-else-if="hasData"
      :value="allPods"
      rowGroupMode="subheader"
      groupRowsBy="groupKey"
      sortField="groupKey"
      :sortOrder="1"
      scrollable
      scrollHeight="flex"
      :rowHover="true"
      size="small"
      stripedRows
      tableStyle="min-width: 50rem"
      class="pods-table"
    >
      <template #groupheader="{ data }">
        <td :colspan="8" class="group-header-cell">
          <div class="group-header">
            <span class="machine-badge">{{ data.machineIndex }}</span>
            <span class="node-icon">⎈</span>
            <span class="node-name">{{ data.nodeName }}</span>
            <Tag :value="data.nodeStatus" :severity="nodeStatusSeverity(data.nodeStatus)" class="node-tag" />
          </div>
        </td>
      </template>

      <Column field="shortId" header="ID">
        <template #body="{ data }">
          <span class="mono">{{ data.shortId }}</span>
        </template>
      </Column>
      <Column field="packName" header="Pack" />
      <Column field="nodeName" header="Node" />
      <Column field="status" header="Status">
        <template #body="{ data }">
          <Tag :value="data.status" :severity="podStatusSeverity(data.status)" />
        </template>
      </Column>
      <Column field="packVersion" header="Version">
        <template #body="{ data }">
          <span class="mono">{{ data.packVersion }}</span>
        </template>
      </Column>
      <Column field="namespace" header="Namespace" />
      <Column field="age" header="Age" />
      <Column header="Actions">
        <template #body="{ data }">
          <Button
            v-if="canStop(data.status)"
            icon="pi pi-stop"
            label="Stop"
            severity="danger"
            size="small"
            text
            :loading="stoppingPods.has(data.id)"
            @click="stopPod(data.id)"
          />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useStarkApi } from '../composables/useStarkApi';

/* ── Types ── */

interface PodData {
  id: string;
  packId: string;
  packVersion: string;
  nodeId: string | null;
  status: string;
  namespace: string;
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
}

interface NodeData {
  id: string;
  name: string;
  status: string;
  machineId?: string;
}

interface PackData {
  id: string;
  name: string;
}

interface PodRow {
  id: string;
  shortId: string;
  packName: string;
  packVersion: string;
  status: string;
  namespace: string;
  age: string;
  nodeName: string;
  nodeStatus: string;
  machineIndex: number;
  groupKey: string;
}

/* ── State ── */

const refreshing = ref(false);
const hasData = ref(false);
const errorMsg = ref('');
const allPods = ref<PodRow[]>([]);
const stoppingPods = ref<Set<string>>(new Set());
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

const api = useStarkApi();
const toast = useToast();

/* ── Helpers ── */

function shortUuid(uuid: string): string {
  return uuid.split('-')[0] ?? uuid.substring(0, 8);
}

function formatAge(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 0) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function canStop(status: string): boolean {
  return ['running', 'pending', 'scheduled', 'starting'].includes(status);
}

function podStatusSeverity(status: string): string {
  switch (status) {
    case 'running': return 'success';
    case 'pending': case 'scheduled': case 'starting': return 'info';
    case 'stopping': return 'warn';
    case 'stopped': return 'secondary';
    case 'failed': case 'evicted': return 'danger';
    default: return 'secondary';
  }
}

function nodeStatusSeverity(status: string): string {
  switch (status) {
    case 'online': return 'success';
    case 'offline': return 'danger';
    case 'draining': return 'warn';
    default: return 'secondary';
  }
}

/* ── Data loading ── */

async function refresh() {
  refreshing.value = true;
  errorMsg.value = '';

  try {
    const [podResult, nodeResult, packResult] = await Promise.all([
      api.pod.list() as Promise<{ pods: PodData[] }>,
      api.node.list() as Promise<{ nodes: NodeData[] }>,
      api.pack.list() as Promise<{ packs: PackData[] }>,
    ]);

    const pods: PodData[] = podResult.pods ?? [];
    const nodes: NodeData[] = nodeResult.nodes ?? [];
    const packs: PackData[] = packResult.packs ?? [];

    // Build lookups
    const nodeMap = new Map<string, NodeData>();
    for (const n of nodes) nodeMap.set(n.id, n);

    const packMap = new Map<string, string>();
    for (const p of packs) packMap.set(p.id, p.name);

    // Assign stable machine indices (grouped by machineId, ordered by first appearance)
    const machineIds: string[] = [];
    for (const n of nodes) {
      const mid = n.machineId ?? '__unknown__';
      if (!machineIds.includes(mid)) machineIds.push(mid);
    }

    const rows: PodRow[] = pods.map((p) => {
      const node = p.nodeId ? nodeMap.get(p.nodeId) : undefined;
      const machineId = node?.machineId ?? '__unknown__';
      let machineIndex = machineIds.indexOf(machineId) + 1;
      if (machineIndex === 0) {
        machineIds.push(machineId);
        machineIndex = machineIds.length;
      }
      const nodeName = node?.name ?? (p.nodeId ? shortUuid(p.nodeId) : 'Unassigned');
      const nodeStatus = node?.status ?? 'unknown';
      const packName = packMap.get(p.packId) ?? shortUuid(p.packId);
      return {
        id: p.id,
        shortId: shortUuid(p.id),
        packName,
        packVersion: p.packVersion,
        status: p.status,
        namespace: p.namespace,
        age: formatAge(p.startedAt ?? p.createdAt),
        nodeName,
        nodeStatus,
        machineIndex,
        groupKey: `${machineIndex}-${nodeName}`,
      };
    });

    allPods.value = rows;
    hasData.value = true;
  } catch (err: unknown) {
    console.error('Failed to load pods:', err);
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load pods';
  } finally {
    refreshing.value = false;
  }
}

async function stopPod(podId: string) {
  stoppingPods.value.add(podId);
  try {
    await api.pod.stop(podId);
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to stop pod:', err);
    toast.add({ severity: 'error', summary: 'Stop Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    stoppingPods.value.delete(podId);
  }
}

onMounted(() => {
  refresh();
  // Auto-refresh every 5 seconds so status transitions are visible
  refreshIntervalId = setInterval(refresh, 5000);
});

onBeforeUnmount(() => {
  if (refreshIntervalId !== null) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
});
</script>

<style scoped>
.pods-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}

/* ── Refresh indicator ── */
.refresh-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 0.7rem;
  color: #64748b;
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(4px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.state-msg {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px;
  color: #94a3b8;
  font-size: 0.85rem;
  flex: 1;
}
.state-msg.error {
  flex-direction: column;
  color: #f87171;
}

.pods-table {
  flex: 1;
  min-height: 0;
}

/* ── Group header styling ── */
.group-header-cell {
  padding: 0 !important;
  border: none !important;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.10) 0%, transparent 100%);
  border-left: 3px solid #3b82f6;
}

.machine-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.18);
  color: #60a5fa;
  font-size: 0.65rem;
  font-weight: 700;
  flex-shrink: 0;
}

.node-icon {
  color: #60a5fa;
  font-size: 0.85rem;
}

.node-name {
  font-weight: 600;
  font-size: 0.82rem;
  color: #e2e8f0;
}

.node-tag {
  font-size: 0.6rem;
}

.mono {
  font-family: 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace;
  font-size: 0.8em;
}
</style>
