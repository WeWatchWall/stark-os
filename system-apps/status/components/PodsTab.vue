<template>
  <div class="pods-tab">
    <!-- Loading state -->
    <div v-if="loading" class="state-msg">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
      <span>Loading pods…</span>
    </div>

    <!-- Error state -->
    <div v-else-if="errorMsg" class="state-msg error">
      <span>{{ errorMsg }}</span>
      <Button label="Retry" severity="secondary" size="small" @click="refresh" />
    </div>

    <!-- Empty state -->
    <div v-else-if="allPods.length === 0" class="state-msg">
      No pods found.
    </div>

    <!-- Grouped pod table -->
    <DataTable
      v-else
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
      class="pods-table"
    >
      <template #groupheader="{ data }">
        <div class="group-header">
          <span class="machine-label">Machine {{ data.machineIndex }}</span>
          <span class="node-divider">›</span>
          <span class="node-icon">⎈</span>
          <span class="node-name">{{ data.nodeName }}</span>
          <Tag :value="data.nodeStatus" :severity="nodeStatusSeverity(data.nodeStatus)" class="node-tag" />
        </div>
      </template>

      <Column field="shortId" header="ID" style="min-width: 90px">
        <template #body="{ data }">
          <span class="mono">{{ data.shortId }}</span>
        </template>
      </Column>
      <Column field="nodeName" header="Node" style="min-width: 120px" />
      <Column field="status" header="Status" style="min-width: 100px">
        <template #body="{ data }">
          <Tag :value="data.status" :severity="podStatusSeverity(data.status)" />
        </template>
      </Column>
      <Column field="packVersion" header="Version" style="min-width: 80px">
        <template #body="{ data }">
          <span class="mono">{{ data.packVersion }}</span>
        </template>
      </Column>
      <Column field="namespace" header="Namespace" style="min-width: 100px" />
      <Column field="age" header="Age" style="min-width: 60px" />
      <Column header="Actions" style="min-width: 90px">
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

    <!-- Toolbar -->
    <div class="toolbar">
      <Button
        icon="pi pi-refresh"
        label="Refresh"
        severity="secondary"
        size="small"
        outlined
        :loading="loading"
        @click="refresh"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
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

interface PodRow {
  id: string;
  shortId: string;
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

const loading = ref(true);
const errorMsg = ref('');
const allPods = ref<PodRow[]>([]);
const stoppingPods = ref<Set<string>>(new Set());

const api = useStarkApi();

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
  loading.value = true;
  errorMsg.value = '';

  try {
    const [podResult, nodeResult] = await Promise.all([
      api.pod.list() as Promise<{ pods: PodData[] }>,
      api.node.list() as Promise<{ nodes: NodeData[] }>,
    ]);

    const pods: PodData[] = podResult.pods ?? [];
    const nodes: NodeData[] = nodeResult.nodes ?? [];

    // Build lookups
    const nodeMap = new Map<string, NodeData>();
    for (const n of nodes) nodeMap.set(n.id, n);

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
      return {
        id: p.id,
        shortId: shortUuid(p.id),
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
  } catch (err: unknown) {
    console.error('Failed to load pods:', err);
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load pods';
  } finally {
    loading.value = false;
  }
}

async function stopPod(podId: string) {
  stoppingPods.value.add(podId);
  try {
    await api.pod.stop(podId);
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to stop pod:', err);
    alert(`Failed to stop pod: ${err instanceof Error ? err.message : 'Unknown error'}`);
  } finally {
    stoppingPods.value.delete(podId);
  }
}

onMounted(() => {
  refresh();
});
</script>

<style scoped>
.pods-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
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

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.machine-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.node-divider {
  color: #475569;
}

.node-icon {
  color: #60a5fa;
}

.node-name {
  font-weight: 600;
  color: #e2e8f0;
}

.node-tag {
  font-size: 0.65rem;
}

.mono {
  font-family: 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace;
  font-size: 0.8em;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 8px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
</style>
