/**
 * Unit tests for Service Controller
 * @module @stark-o/server/tests/unit/service-controller
 *
 * Tests the service controller reconciliation logic, specifically:
 * - followLatest version updates trigger rolling updates
 * - Rolling updates send pod:stop messages to nodes
 * - 'stopping' pods are excluded from active pods so replacements are created
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Service, Pack } from '@stark-o/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock supabase query factories
const mockServiceQueries = {
  listActiveServices: vi.fn(),
  updateService: vi.fn(),
  updateReplicaCounts: vi.fn(),
};

const mockPodQueries = {
  listPodsByService: vi.fn(),
  updatePod: vi.fn(),
  createPodWithIncarnation: vi.fn(),
  getNextIncarnation: vi.fn(),
};

const mockNodeQueries = {
  listNodes: vi.fn(),
  getNodeById: vi.fn(),
};

const mockPackQueries = {
  getPackById: vi.fn(),
  getLatestPackVersion: vi.fn(),
  canNodeAccessPack: vi.fn(),
};

vi.mock('../../src/supabase/services.js', () => ({
  getServiceQueriesAdmin: () => mockServiceQueries,
}));

vi.mock('../../src/supabase/pods.js', () => ({
  getPodQueriesAdmin: () => mockPodQueries,
}));

vi.mock('../../src/supabase/nodes.js', () => ({
  getNodeQueries: () => mockNodeQueries,
}));

vi.mock('../../src/supabase/packs.js', () => ({
  getPackQueriesAdmin: () => mockPackQueries,
}));

const mockSendToNode = vi.fn();
vi.mock('../../src/services/connection-service.js', () => ({
  getConnectionManager: () => null,
  sendToNode: (...args: unknown[]) => mockSendToNode(...args),
}));

vi.mock('../../src/services/pod-auth-service.js', () => ({
  generatePodToken: () => ({ token: 'tok', refreshToken: 'rtok', expiresAt: new Date() }),
}));

import { ServiceController } from '../../src/services/service-controller.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-1',
    name: 'test-svc',
    packId: 'pack-old',
    packVersion: '0.0.14',
    followLatest: true,
    namespace: 'default',
    replicas: 0,
    status: 'active',
    labels: {},
    annotations: {},
    podLabels: {},
    podAnnotations: {},
    tolerations: [],
    resourceRequests: { cpu: 100, memory: 128 },
    resourceLimits: { cpu: 500, memory: 512 },
    priority: 0,
    observedGeneration: 1,
    readyReplicas: 1,
    availableReplicas: 1,
    updatedReplicas: 1,
    consecutiveFailures: 0,
    visibility: 'private',
    exposed: false,
    secrets: [],
    enableEphemeral: false,
    metadata: {},
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    volumeMounts: [],
    ...overrides,
  };
}

function makePack(overrides: Partial<Pack> = {}): Pack {
  return {
    id: 'pack-old',
    name: 'start-menu',
    version: '0.0.14',
    runtimeTag: 'browser',
    ownerId: 'user-1',
    visibility: 'private',
    bundlePath: 'packs/start-menu/0.0.14/bundle.js',
    metadata: {},
    grantedCapabilities: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ServiceController', () => {
  let controller: ServiceController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new ServiceController({ autoStart: false, reconcileInterval: 999999 });
  });

  afterEach(() => {
    controller.stop();
  });

  describe('followLatest rolling update', () => {
    it('should update service and mark old pods as stopping when a new pack version is available', async () => {
      const service = makeService({ followLatest: true, packId: 'pack-old', packVersion: '0.0.14' });

      mockServiceQueries.listActiveServices.mockResolvedValue({ data: [service], error: null });

      // Pack lookup: old pack → name, then latest version → new pack
      mockPackQueries.getPackById.mockResolvedValue({
        data: makePack({ id: 'pack-old', version: '0.0.14' }),
        error: null,
      });
      mockPackQueries.getLatestPackVersion.mockResolvedValue({
        data: makePack({ id: 'pack-new', version: '0.0.15' }),
        error: null,
      });

      // Rolling update: one running pod on old version
      mockPodQueries.listPodsByService.mockResolvedValue({
        data: [
          { id: 'pod-1', nodeId: 'node-1', status: 'running', packVersion: '0.0.14' },
        ],
        error: null,
      });

      mockServiceQueries.updateService.mockResolvedValue({ data: service, error: null });
      mockPodQueries.updatePod.mockResolvedValue({ data: {}, error: null });
      mockNodeQueries.getNodeById.mockResolvedValue({
        data: { id: 'node-1', connectionId: 'conn-1' },
        error: null,
      });
      mockSendToNode.mockReturnValue(true);

      // No nodes for DaemonSet (focus on rolling update)
      mockNodeQueries.listNodes.mockResolvedValue({ data: [], error: null });
      mockServiceQueries.updateReplicaCounts.mockResolvedValue({ data: {}, error: null });

      await controller.triggerReconcile();

      // Service should be updated to new pack
      expect(mockServiceQueries.updateService).toHaveBeenCalledWith(
        'svc-1',
        expect.objectContaining({
          packId: 'pack-new',
          packVersion: '0.0.15',
        }),
      );

      // Old pod should be marked as stopping
      expect(mockPodQueries.updatePod).toHaveBeenCalledWith(
        'pod-1',
        expect.objectContaining({
          status: 'stopping',
          statusMessage: expect.stringContaining('0.0.15'),
        }),
      );

      // A pod:stop message should be sent to the node
      expect(mockSendToNode).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({
          type: 'pod:stop',
          payload: expect.objectContaining({
            podId: 'pod-1',
            reason: 'rolling_update',
          }),
        }),
      );
    });
  });

  describe('stopping pods excluded from active pods', () => {
    it('should not count stopping pods toward DaemonSet node coverage', async () => {
      const service = makeService({
        followLatest: false,
        replicas: 0,
        packId: 'pack-1',
        packVersion: '0.0.15',
      });

      mockServiceQueries.listActiveServices.mockResolvedValue({ data: [service], error: null });

      // Pod on node-1 is 'stopping' (mid-rolling-update)
      mockPodQueries.listPodsByService.mockResolvedValue({
        data: [
          { id: 'pod-old', nodeId: 'node-1', status: 'stopping', packVersion: '0.0.14', updatedAt: new Date() },
        ],
        error: null,
      });

      mockPackQueries.getPackById.mockResolvedValue({
        data: makePack({ id: 'pack-1', version: '0.0.15', runtimeTag: 'browser' }),
        error: null,
      });

      // One online node that should get a new pod
      mockNodeQueries.listNodes.mockResolvedValue({
        data: [{ id: 'node-1', name: 'browser-1', runtimeType: 'browser', registeredBy: 'user-1' }],
        error: null,
      });

      mockPackQueries.canNodeAccessPack.mockResolvedValue({ data: true, error: null });

      // Pod creation mocks
      mockPodQueries.getNextIncarnation.mockResolvedValue({ data: 2, error: null });
      mockPodQueries.createPodWithIncarnation.mockResolvedValue({
        data: { id: 'pod-new', incarnation: 2 },
        error: null,
      });
      mockNodeQueries.getNodeById.mockResolvedValue({
        data: { id: 'node-1', name: 'browser-1', connectionId: 'conn-1' },
        error: null,
      });

      mockServiceQueries.updateReplicaCounts.mockResolvedValue({ data: {}, error: null });

      await controller.triggerReconcile();

      // A new pod should be created because the stopping pod is excluded from active pods
      expect(mockPodQueries.createPodWithIncarnation).toHaveBeenCalled();
    });

    it('should create replacement pods for replicas > 0 when existing pods are stopping', async () => {
      const service = makeService({
        followLatest: false,
        replicas: 2,
        packId: 'pack-1',
        packVersion: '0.0.15',
      });

      mockServiceQueries.listActiveServices.mockResolvedValue({ data: [service], error: null });

      // Both pods are 'stopping' (mid-rolling-update)
      mockPodQueries.listPodsByService.mockResolvedValue({
        data: [
          { id: 'pod-1', nodeId: 'node-1', status: 'stopping', packVersion: '0.0.14', updatedAt: new Date() },
          { id: 'pod-2', nodeId: 'node-2', status: 'stopping', packVersion: '0.0.14', updatedAt: new Date() },
        ],
        error: null,
      });

      mockPackQueries.getPackById.mockResolvedValue({
        data: makePack({ id: 'pack-1', version: '0.0.15' }),
        error: null,
      });

      // Pod creation mocks
      mockPodQueries.getNextIncarnation.mockResolvedValue({ data: 3, error: null });
      mockPodQueries.createPodWithIncarnation.mockResolvedValue({
        data: { id: 'pod-new', incarnation: 3 },
        error: null,
      });

      mockServiceQueries.updateReplicaCounts.mockResolvedValue({ data: {}, error: null });

      await controller.triggerReconcile();

      // Two new pods should be created (desired=2, active=0 since stopping pods excluded)
      expect(mockPodQueries.createPodWithIncarnation).toHaveBeenCalledTimes(2);
    });
  });
});
