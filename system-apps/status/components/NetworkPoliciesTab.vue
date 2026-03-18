<template>
  <div class="policies-tab">
    <!-- Refreshing indicator -->
    <div v-if="refreshing && hasData" class="refresh-dot" title="Updating…">
      <ProgressSpinner style="width: 12px; height: 12px" strokeWidth="6" />
    </div>

    <!-- Initial loading state -->
    <div v-if="!hasData && refreshing" class="state-msg">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
      <span>Loading network policies…</span>
    </div>

    <!-- Error state -->
    <div v-else-if="!hasData && errorMsg" class="state-msg error">
      <span>{{ errorMsg }}</span>
      <Button label="Retry" severity="secondary" size="small" @click="refresh" />
    </div>

    <!-- Main content -->
    <div v-else-if="hasData" class="policies-content">
      <!-- Create policy form -->
      <div class="create-form">
        <div class="form-title">Create Policy</div>
        <div class="form-row">
          <Select
            v-model="newPolicy.sourceService"
            :options="serviceOptions"
            optionLabel="label"
            optionValue="value"
            filter
            filterPlaceholder="Search services…"
            placeholder="Source service"
            class="form-dropdown"
            :pt="{ list: { style: 'max-height: 200px' } }"
          />
          <span class="form-arrow">→</span>
          <Select
            v-model="newPolicy.targetService"
            :options="serviceOptions"
            optionLabel="label"
            optionValue="value"
            filter
            filterPlaceholder="Search services…"
            placeholder="Target service"
            class="form-dropdown"
            :pt="{ list: { style: 'max-height: 200px' } }"
          />
          <select v-model="newPolicy.action" class="form-select">
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
          <input v-model="newPolicy.namespace" placeholder="Namespace" class="form-input form-input-sm" />
          <Button
            icon="pi pi-plus"
            label="Create"
            severity="success"
            size="small"
            :loading="creating"
            @click="createPolicy"
            :disabled="!newPolicy.sourceService || !newPolicy.targetService"
          />
        </div>
      </div>

      <!-- Orphaned policies warning -->
      <div v-if="orphanedPolicies.length > 0" class="orphan-banner">
        <span class="orphan-icon">⚠️</span>
        <span>{{ orphanedPolicies.length }} orphaned polic{{ orphanedPolicies.length === 1 ? 'y' : 'ies' }} detected (source or target service missing)</span>
      </div>

      <!-- Empty state -->
      <div v-if="policies.length === 0" class="state-msg compact">
        No network policies. All inter-service traffic is denied by default.
      </div>

      <!-- Policies table -->
      <DataTable
        v-else
        :value="policies"
        scrollable
        scrollHeight="flex"
        :rowHover="true"
        stripedRows
        class="policies-table"
      >
        <Column field="sourceService" header="Source" sortable style="min-width: 120px">
          <template #body="{ data }">
            <div class="service-cell">
              <span class="service-cell-name">{{ data.sourceService }}</span>
              <Tag v-if="data.sourceOrphaned" value="missing" severity="danger" class="orphan-tag" />
            </div>
          </template>
        </Column>
        <Column header="" style="width: 40px; text-align: center">
          <template #body>
            <span class="arrow-cell">→</span>
          </template>
        </Column>
        <Column field="targetService" header="Target" sortable style="min-width: 120px">
          <template #body="{ data }">
            <div class="service-cell">
              <span class="service-cell-name">{{ data.targetService }}</span>
              <Tag v-if="data.targetOrphaned" value="missing" severity="danger" class="orphan-tag" />
            </div>
          </template>
        </Column>
        <Column field="action" header="Action" sortable style="min-width: 70px">
          <template #body="{ data }">
            <Tag :value="data.action" :severity="data.action === 'allow' ? 'success' : 'danger'" />
          </template>
        </Column>
        <Column field="namespace" header="Namespace" sortable class="hide-on-mobile" style="min-width: 90px" />
        <Column field="createdAt" header="Created" sortable class="hide-on-mobile" style="min-width: 100px">
          <template #body="{ data }">
            <span class="mono time-cell">{{ formatTime(data.createdAt) }}</span>
          </template>
        </Column>
        <Column header="Actions" style="min-width: 60px">
          <template #body="{ data }">
            <Button
              icon="pi pi-trash"
              severity="danger"
              size="small"
              text
              :loading="deletingPolicies.has(data.id)"
              @click="deletePolicy(data.id)"
              title="Delete policy"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onBeforeUnmount } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useStarkApi } from '../composables/useStarkApi';

/* ── Types ── */

interface PolicyData {
  id: string;
  sourceService: string;
  targetService: string;
  action: string;
  namespace: string;
  createdAt: string;
}

interface ServiceData {
  id: string;
  name: string;
}

interface PolicyRow extends PolicyData {
  sourceOrphaned: boolean;
  targetOrphaned: boolean;
}

/* ── State ── */

const refreshing = ref(false);
const hasData = ref(false);
const errorMsg = ref('');
const creating = ref(false);
const policies = ref<PolicyRow[]>([]);
const serviceNames = ref<string[]>([]);
const deletingPolicies = ref<Set<string>>(new Set());
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

const newPolicy = reactive({
  sourceService: '',
  targetService: '',
  action: 'allow',
  namespace: 'default',
});

const api = useStarkApi();
const toast = useToast();

const orphanedPolicies = computed(() =>
  policies.value.filter((p) => p.sourceOrphaned || p.targetOrphaned)
);

const serviceOptions = computed(() =>
  serviceNames.value.map((name) => ({ label: name, value: name }))
);

/* ── Helpers ── */

function formatTime(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/* ── Data loading ── */

async function refresh() {
  refreshing.value = true;
  errorMsg.value = '';

  try {
    const [policyResult, serviceResult] = await Promise.all([
      api.network.policies() as Promise<PolicyData[]>,
      api.service.list() as Promise<{ services: ServiceData[] }>,
    ]);

    const rawPolicies: PolicyData[] = Array.isArray(policyResult) ? policyResult : [];
    const services: ServiceData[] = serviceResult.services ?? [];
    const svcNames = new Set(services.map((s) => s.name));
    serviceNames.value = [...svcNames].sort();

    policies.value = rawPolicies.map((p) => ({
      ...p,
      sourceOrphaned: !svcNames.has(p.sourceService),
      targetOrphaned: !svcNames.has(p.targetService),
    }));

    hasData.value = true;
  } catch (err: unknown) {
    console.error('Failed to load policies:', err);
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load policies';
  } finally {
    refreshing.value = false;
  }
}

async function createPolicy() {
  if (!newPolicy.sourceService || !newPolicy.targetService) return;
  creating.value = true;
  try {
    await api.network.createPolicy({
      sourceService: newPolicy.sourceService,
      targetService: newPolicy.targetService,
      action: newPolicy.action,
      namespace: newPolicy.namespace || 'default',
    });
    toast.add({ severity: 'success', summary: 'Policy Created', detail: `${newPolicy.sourceService} → ${newPolicy.targetService}: ${newPolicy.action}`, life: 5000 });
    newPolicy.sourceService = '';
    newPolicy.targetService = '';
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to create policy:', err);
    toast.add({ severity: 'error', summary: 'Create Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    creating.value = false;
  }
}

async function deletePolicy(id: string) {
  deletingPolicies.value.add(id);
  try {
    await api.network.deletePolicy(id);
    toast.add({ severity: 'success', summary: 'Policy Deleted', life: 3000 });
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to delete policy:', err);
    toast.add({ severity: 'error', summary: 'Delete Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    deletingPolicies.value.delete(id);
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
.policies-tab {
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
.state-msg.compact {
  padding: 20px;
}
.state-msg.error {
  flex-direction: column;
  color: #f87171;
}

.policies-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── Create form ── */
.create-form {
  padding: 12px;
  background: #181818;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.form-title {
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 8px;
  font-size: 0.85rem;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.form-dropdown {
  flex: 1;
  min-width: 140px;
}

.form-input {
  background: #1e1e1e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.85rem;
  min-width: 0;
  flex: 1;
}

.form-input-sm {
  max-width: 120px;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.form-input::placeholder {
  color: #475569;
}

.form-select {
  background: #1e1e1e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.85rem;
}

.form-arrow {
  color: #60a5fa;
  font-weight: 700;
  font-size: 1.1rem;
  flex-shrink: 0;
}

/* ── Orphan banner ── */
.orphan-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(251, 191, 36, 0.08);
  border-bottom: 1px solid rgba(251, 191, 36, 0.15);
  color: #fbbf24;
  font-size: 0.82rem;
  flex-shrink: 0;
}

.orphan-icon {
  font-size: 0.9rem;
}

/* ── Policies table ── */
.policies-table {
  flex: 1;
  min-height: 0;
}

.service-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.service-cell-name {
  font-weight: 500;
}

.orphan-tag {
  font-size: 0.6rem;
}

.arrow-cell {
  color: #60a5fa;
  font-weight: 700;
  font-size: 1rem;
}

.mono {
  font-family: 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace;
  font-size: 0.9em;
}

.time-cell {
  color: #94a3b8;
  white-space: nowrap;
}

/* ── Mobile responsive ── */
@media (max-width: 640px) {
  :deep(.hide-on-mobile) {
    display: none !important;
  }

  .form-row {
    flex-direction: column;
    align-items: stretch;
  }

  .form-arrow {
    text-align: center;
  }

  .form-input-sm {
    max-width: none;
  }
}
</style>
