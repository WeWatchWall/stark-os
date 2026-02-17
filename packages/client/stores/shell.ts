import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

/* ─── Types ─── */

export type LayoutMode = 'desktop' | 'mobile';

export interface ShellWindow {
  id: string;
  title: string;
  /** Pod ID this window represents */
  podId: string;
  /** Container iframe ID for surface mount */
  containerId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  /** Mobile: 'full' or 'half' */
  mobileSnap: 'full' | 'half-top' | 'half-bottom' | null;
  workspaceId: string;
}

export interface Workspace {
  id: string;
  name: string;
}

/* ─── Constants ─── */

const MOBILE_BREAKPOINT = 768;
const DEFAULT_WINDOW_W = 800;
const DEFAULT_WINDOW_H = 500;
const TASKBAR_HEIGHT = 48;

/* ─── Store ─── */

export const useShellStore = defineStore('shell', () => {
  /* ── Layout Mode ── */
  const autoLayoutMode = ref<LayoutMode>(
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT ? 'mobile' : 'desktop',
  );
  const manualOverride = ref<LayoutMode | null>(null);

  const layoutMode = computed<LayoutMode>(
    () => manualOverride.value ?? autoLayoutMode.value,
  );

  function setManualLayoutMode(mode: LayoutMode | null) {
    manualOverride.value = mode;
  }

  function detectLayoutMode() {
    if (typeof window !== 'undefined') {
      autoLayoutMode.value = window.innerWidth < MOBILE_BREAKPOINT ? 'mobile' : 'desktop';
    }
  }

  /* ── Workspaces ── */
  const workspaces = ref<Workspace[]>([
    { id: 'ws-1', name: 'Workspace 1' },
  ]);
  const activeWorkspaceId = ref('ws-1');

  const activeWorkspace = computed(
    () => workspaces.value.find((ws) => ws.id === activeWorkspaceId.value) ?? workspaces.value[0],
  );

  function addWorkspace(name?: string) {
    const id = `ws-${Date.now()}`;
    workspaces.value.push({ id, name: name ?? `Workspace ${workspaces.value.length + 1}` });
    return id;
  }

  function removeWorkspace(id: string) {
    if (workspaces.value.length <= 1) return;
    workspaces.value = workspaces.value.filter((ws) => ws.id !== id);
    if (activeWorkspaceId.value === id) {
      activeWorkspaceId.value = workspaces.value[0].id;
    }
  }

  function switchWorkspace(id: string) {
    activeWorkspaceId.value = id;
  }

  /* ── Windows ── */
  const windows = ref<ShellWindow[]>([]);
  let nextZIndex = 100;

  const activeWindows = computed(() =>
    windows.value.filter((w) => w.workspaceId === activeWorkspaceId.value),
  );

  const focusedWindowId = ref<string | null>(null);

  function openWindow(opts: {
    podId: string;
    title?: string;
    width?: number;
    height?: number;
  }): ShellWindow {
    const id = `win-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const containerId = `stark-container-${id}`;
    const w = opts.width ?? DEFAULT_WINDOW_W;
    const h = opts.height ?? DEFAULT_WINDOW_H;

    const win: ShellWindow = {
      id,
      title: opts.title ?? opts.podId,
      podId: opts.podId,
      containerId,
      x: 60 + (windows.value.length % 8) * 30,
      y: TASKBAR_HEIGHT + 20 + (windows.value.length % 8) * 30,
      width: w,
      height: h,
      zIndex: nextZIndex++,
      minimized: false,
      maximized: false,
      mobileSnap: layoutMode.value === 'mobile' ? 'full' : null,
      workspaceId: activeWorkspaceId.value,
    };

    windows.value.push(win);
    focusedWindowId.value = id;
    return win;
  }

  function closeWindow(id: string) {
    windows.value = windows.value.filter((w) => w.id !== id);
    if (focusedWindowId.value === id) {
      const remaining = activeWindows.value;
      focusedWindowId.value = remaining.length
        ? remaining.reduce((a, b) => (a.zIndex > b.zIndex ? a : b)).id
        : null;
    }
  }

  function focusWindow(id: string) {
    const win = windows.value.find((w) => w.id === id);
    if (!win) return;
    win.zIndex = nextZIndex++;
    win.minimized = false;
    focusedWindowId.value = id;
  }

  function minimizeWindow(id: string) {
    const win = windows.value.find((w) => w.id === id);
    if (!win) return;
    win.minimized = true;
    if (focusedWindowId.value === id) {
      const visible = activeWindows.value.filter((w) => !w.minimized);
      focusedWindowId.value = visible.length
        ? visible.reduce((a, b) => (a.zIndex > b.zIndex ? a : b)).id
        : null;
    }
  }

  function toggleMaximize(id: string) {
    const win = windows.value.find((w) => w.id === id);
    if (!win) return;
    win.maximized = !win.maximized;
    focusWindow(id);
  }

  function moveWindow(id: string, x: number, y: number) {
    const win = windows.value.find((w) => w.id === id);
    if (!win) return;
    win.x = x;
    win.y = y;
  }

  function resizeWindow(id: string, width: number, height: number) {
    const win = windows.value.find((w) => w.id === id);
    if (!win) return;
    win.width = Math.max(300, width);
    win.height = Math.max(200, height);
  }

  /** Mobile snap: full or half screen along longer axis */
  function setMobileSnap(id: string, snap: 'full' | 'half-top' | 'half-bottom') {
    const win = windows.value.find((w) => w.id === id);
    if (!win) return;
    win.mobileSnap = snap;
    focusWindow(id);
  }

  return {
    /* Layout */
    layoutMode,
    autoLayoutMode,
    manualOverride,
    setManualLayoutMode,
    detectLayoutMode,
    /* Workspaces */
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    addWorkspace,
    removeWorkspace,
    switchWorkspace,
    /* Windows */
    windows,
    activeWindows,
    focusedWindowId,
    openWindow,
    closeWindow,
    focusWindow,
    minimizeWindow,
    toggleMaximize,
    moveWindow,
    resizeWindow,
    setMobileSnap,
    TASKBAR_HEIGHT,
  };
});
