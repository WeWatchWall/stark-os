<template>
  <div class="events-tab">
    <!-- Refreshing indicator -->
    <div v-if="refreshing && hasData" class="refresh-dot" title="Updating…">
      <ProgressSpinner style="width: 12px; height: 12px" strokeWidth="6" />
    </div>

    <!-- Initial loading state -->
    <div v-if="!hasData && refreshing" class="state-msg">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
      <span>Loading events…</span>
    </div>

    <!-- Error state -->
    <div v-else-if="!hasData && errorMsg" class="state-msg error">
      <span>{{ errorMsg }}</span>
      <Button label="Retry" severity="secondary" size="small" @click="refresh" />
    </div>

    <!-- Empty state -->
    <div v-else-if="hasData && events.length === 0" class="state-msg">
      No events found.
    </div>

    <!-- Events table -->
    <DataTable
      v-else-if="hasData"
      :value="events"
      scrollable
      scrollHeight="flex"
      :rowHover="true"
      stripedRows
      class="events-table"
    >
      <Column field="timestamp" header="Time" sortable style="min-width: 110px">
        <template #body="{ data }">
          <span class="mono time-cell">{{ formatTime(data.timestamp) }}</span>
        </template>
      </Column>
      <Column field="category" header="Category" sortable style="min-width: 80px">
        <template #body="{ data }">
          <Tag :value="data.category" :severity="categorySeverity(data.category)" />
        </template>
      </Column>
      <Column field="severity" header="Severity" sortable class="hide-on-mobile" style="min-width: 80px">
        <template #body="{ data }">
          <Tag :value="data.severity" :severity="severityColor(data.severity)" />
        </template>
      </Column>
      <Column field="eventType" header="Event" sortable style="min-width: 120px">
        <template #body="{ data }">
          <span class="event-type">{{ humanizeEventType(data.eventType) }}</span>
        </template>
      </Column>
      <Column field="resourceName" header="Resource" sortable class="hide-on-mobile" style="min-width: 100px">
        <template #body="{ data }">
          <span v-if="data.resourceName" class="mono">{{ data.resourceName }}</span>
          <span v-else class="muted-text">—</span>
        </template>
      </Column>
      <Column field="message" header="Message" style="min-width: 180px">
        <template #body="{ data }">
          <span class="message-cell">{{ data.message ?? data.reason ?? '—' }}</span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useStarkApi } from '../composables/useStarkApi';

/* ── Types ── */

interface EventData {
  id: string;
  eventType: string;
  category: string;
  severity: string;
  resourceId?: string;
  resourceType?: string;
  resourceName?: string;
  namespace: string;
  reason?: string;
  message?: string;
  timestamp: string;
}

/* ── State ── */

const refreshing = ref(false);
const hasData = ref(false);
const errorMsg = ref('');
const events = ref<EventData[]>([]);
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

const api = useStarkApi();

/* ── Helpers ── */

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function humanizeEventType(type: string): string {
  return type.replace(/([A-Z])/g, ' $1').trim();
}

function categorySeverity(category: string): string {
  switch (category) {
    case 'pod': return 'info';
    case 'node': return 'warn';
    case 'service': return 'success';
    case 'system': return 'secondary';
    case 'auth': return 'contrast';
    case 'scheduler': return 'info';
    default: return 'secondary';
  }
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'info': return 'info';
    case 'warning': return 'warn';
    case 'error': return 'danger';
    case 'critical': return 'danger';
    default: return 'secondary';
  }
}

/* ── Data loading ── */

async function refresh() {
  refreshing.value = true;
  errorMsg.value = '';

  try {
    const result = await api.events.list({ limit: 200 }) as {
      events: EventData[];
      total: number;
      hasMore: boolean;
    };

    events.value = result.events ?? [];
    hasData.value = true;
  } catch (err: unknown) {
    console.error('Failed to load events:', err);
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load events';
  } finally {
    refreshing.value = false;
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
.events-tab {
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

.events-table {
  flex: 1;
  min-height: 0;
}

.mono {
  font-family: 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace;
  font-size: 0.9em;
}

.time-cell {
  white-space: nowrap;
  color: #94a3b8;
}

.event-type {
  font-weight: 500;
}

.message-cell {
  color: #cbd5e1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 400px;
}

.muted-text {
  color: #475569;
}

@media (max-width: 640px) {
  :deep(.hide-on-mobile) {
    display: none !important;
  }

  .message-cell {
    max-width: 200px;
  }
}
</style>
