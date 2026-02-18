import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

/* ─── Types ─── */

export type LayoutMode = 'desktop' | 'mobile';

/**
 * Mobile snap positions.
 * 'half-first' / 'half-second' split along the longer screen axis:
 *   Portrait  → first = top,  second = bottom
 *   Landscape → first = left, second = right
 */
export type MobileSnap = 'full' | 'half-first' | 'half-second';

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
  /** Mobile snap along longer axis */
  mobileSnap: MobileSnap | null;
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
let idCounter = 1; // starts at 1 because default workspace is 'ws-1'

/* ─── Store ─── */

export const useShellStore = defineStore('shell', () => {
  /* ── Layout Mode ── */
  const autoLayoutMode = ref<LayoutMode>(
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT ? 'mobile' : 'desktop',
  );
  const manualOverride = ref<LayoutMode | null>(null);

  /** Reactive screen dimensions – updated on resize / orientation change */
  const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const windowHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 768);

  const layoutMode = computed<LayoutMode>(
    () => manualOverride.value ?? autoLayoutMode.value,
  );

  function detectLayoutMode() {
    if (typeof window !== 'undefined') {
      windowWidth.value = window.innerWidth;
      windowHeight.value = window.innerHeight;
      const prev = layoutMode.value;
      autoLayoutMode.value = window.innerWidth < MOBILE_BREAKPOINT ? 'mobile' : 'desktop';
      const next = layoutMode.value;
      if (prev !== next) syncWindowsForMode(next);
    }
  }

  function setManualLayoutMode(mode: LayoutMode | null) {
    const prev = layoutMode.value;
    manualOverride.value = mode;
    const next = layoutMode.value;
    if (prev !== next) syncWindowsForMode(next);
  }

  /** Reconcile window state when the layout mode changes */
  function syncWindowsForMode(mode: LayoutMode) {
    for (const win of windows.value) {
      if (mode === 'mobile') {
        // Moving to mobile: clear maximized, ensure mobileSnap is set
        win.maximized = false;
        if (!win.mobileSnap) win.mobileSnap = 'full';
      } else {
        // Moving to desktop: clear mobileSnap
        win.mobileSnap = null;
      }
    }
    // Taskbar is always visible regardless of mode
  }

  /** True when screen is taller than wide (portrait orientation) */
  const isPortrait = computed(() => windowHeight.value > windowWidth.value);

  /** Taskbar is always visible */
  const taskbarVisible = ref(true);

  /** Taskbar position: 'top' for desktop, 'left' for mobile (any orientation) */
  const taskbarPosition = computed<'top' | 'left'>(() => {
    if (layoutMode.value === 'desktop') return 'top';
    return 'left';
  });

  function showTaskbar() { taskbarVisible.value = true; }
  function hideTaskbar() { taskbarVisible.value = false; }
  function toggleTaskbar() { taskbarVisible.value = !taskbarVisible.value; }

  /* ── Workspaces ── */
  const workspaces = ref<Workspace[]>([
    { id: 'ws-1', name: 'Workspace 1' },
  ]);
  const activeWorkspaceId = ref('ws-1');

  const activeWorkspace = computed(
    () => workspaces.value.find((ws) => ws.id === activeWorkspaceId.value) ?? workspaces.value[0],
  );

  function addWorkspace(name?: string) {
    const id = `ws-${++idCounter}`;
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
    const id = `win-${++idCounter}`;
    const containerId = `stark-container-${id}`;
    const w = opts.width ?? DEFAULT_WINDOW_W;
    const h = opts.height ?? DEFAULT_WINDOW_H;

    const win: ShellWindow = {
      id,
      title: opts.title ?? opts.podId,
      podId: opts.podId,
      containerId,
      x: 60 + (windows.value.length % 8) * 30,
      y: 20 + (windows.value.length % 8) * 30,
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
  function setMobileSnap(id: string, snap: MobileSnap) {
    const win = windows.value.find((w) => w.id === id);
    if (!win) return;
    win.mobileSnap = snap;
    focusWindow(id);
  }

  function clearFocus() {
    focusedWindowId.value = null;
  }

  return {
    /* Layout */
    layoutMode,
    autoLayoutMode,
    manualOverride,
    setManualLayoutMode,
    detectLayoutMode,
    isPortrait,
    taskbarVisible,
    taskbarPosition,
    showTaskbar,
    hideTaskbar,
    toggleTaskbar,
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
    clearFocus,
    TASKBAR_HEIGHT,
  };
});
