<template>
  <div class="graphite">
    <!-- Top bar -->
    <div class="top-bar">
      <div class="top-left">
        <span class="app-title">🎨 Graphite</span>
        <button class="bar-btn" @click="openFilePicker">Open</button>
        <button class="bar-btn" @click="saveFile">Save</button>
        <button class="bar-btn" @click="saveAsFile">Save As</button>
        <button class="bar-btn" @click="exportPng">Export PNG</button>
        <button class="bar-btn" @click="newCanvas">New</button>
      </div>
      <div class="top-right">
        <button class="bar-btn" :disabled="!canUndo" @click="undo" title="Undo (Ctrl+Z)">↶</button>
        <button class="bar-btn" :disabled="!canRedo" @click="redo" title="Redo (Ctrl+Y)">↷</button>
        <span class="status-text" :class="saveStatus">{{ saveStatusText }}</span>
      </div>
    </div>

    <!-- Tool bar -->
    <div class="tool-bar">
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="tool-btn"
        :class="{ active: currentTool === tool.id }"
        :title="tool.label"
        @click="currentTool = tool.id"
      >{{ tool.icon }}</button>
      <span class="tool-sep"></span>
      <label class="tool-label">
        Stroke:
        <input type="color" v-model="strokeColor" class="color-input" />
        <input type="number" v-model.number="strokeWidth" min="1" max="50" class="num-input" title="Stroke width" />
      </label>
      <label class="tool-label">
        Fill:
        <input type="color" v-model="fillColor" class="color-input" />
        <label class="checkbox-label">
          <input type="checkbox" v-model="useFill" />
          On
        </label>
      </label>
      <label class="tool-label" v-if="currentTool === 'text'">
        Size:
        <input type="number" v-model.number="fontSize" min="8" max="200" class="num-input" />
      </label>
    </div>

    <!-- Canvas area -->
    <div class="canvas-area" ref="canvasArea">
      <canvas
        ref="canvasEl"
        class="drawing-canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @wheel.prevent="onWheel"
      ></canvas>
    </div>

    <!-- Status bar -->
    <div class="status-bar">
      <span>{{ currentFilePath || 'Untitled' }}</span>
      <span>{{ canvasWidth }} × {{ canvasHeight }}</span>
      <span>{{ shapes.length }} objects</span>
      <span>Zoom: {{ Math.round(zoomLevel * 100) }}%</span>
    </div>

    <!-- File pickers -->
    <FilesPicker
      v-model:visible="showOpenPicker"
      mode="file"
      title="Open Image"
      :extensions="imageExtensions"
      initialPath="/home"
      @select="onFileSelected"
      @cancel="showOpenPicker = false"
    />
    <FilesPicker
      v-model:visible="showSavePicker"
      mode="save"
      :title="savePickerTitle"
      :extensions="savePickerExtensions"
      :initialPath="saveInitialPath"
      :defaultFileName="saveDefaultName"
      @select="onSaveSelected"
      @cancel="showSavePicker = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';

/* ── Types ── */

type ToolType = 'select' | 'pen' | 'line' | 'rect' | 'ellipse' | 'text' | 'eraser';

interface Point { x: number; y: number; }

interface Shape {
  id: number;
  type: 'path' | 'line' | 'rect' | 'ellipse' | 'text' | 'image';
  points?: Point[];
  x?: number; y?: number;
  width?: number; height?: number;
  x2?: number; y2?: number;
  text?: string;
  fontSize?: number;
  strokeColor: string;
  fillColor: string;
  useFill: boolean;
  strokeWidth: number;
  imageData?: string; // base64 for images
}

/* ── Tools ── */

const tools: { id: ToolType; label: string; icon: string }[] = [
  { id: 'select', label: 'Select (V)', icon: '↖' },
  { id: 'pen', label: 'Pen (P)', icon: '✏' },
  { id: 'line', label: 'Line (L)', icon: '/' },
  { id: 'rect', label: 'Rectangle (R)', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse (E)', icon: '◯' },
  { id: 'text', label: 'Text (T)', icon: 'T' },
  { id: 'eraser', label: 'Eraser (X)', icon: '🧹' },
];

/* ── State ── */

const canvasEl = ref<HTMLCanvasElement | null>(null);
const canvasArea = ref<HTMLElement | null>(null);
const currentTool = ref<ToolType>('pen');
const strokeColor = ref('#ffffff');
const fillColor = ref('#3b82f6');
const useFill = ref(false);
const strokeWidth = ref(2);
const fontSize = ref(24);
const canvasWidth = ref(1200);
const canvasHeight = ref(800);
const zoomLevel = ref(1);
const panOffset = ref<Point>({ x: 0, y: 0 });

const shapes = ref<Shape[]>([]);
const undoStack = ref<Shape[][]>([]);
const redoStack = ref<Shape[][]>([]);
const currentFilePath = ref('');
const saveStatus = ref<'saved' | 'saving' | 'idle' | 'modified'>('idle');

const showOpenPicker = ref(false);
const showSavePicker = ref(false);
const savePickerTitle = ref('Save As');
const savePickerExtensions = ref([{ label: 'PNG Image', extensions: ['.png'] }]);
const saveDefaultName = ref('drawing');
let saveMode: 'save-project' | 'export-png' = 'save-project';

let opfsRoot: FileSystemDirectoryHandle | null = null;
let isDrawing = false;
let currentShape: Shape | null = null;
let shapeIdCounter = 0;
let selectedShapeId = -1;
let dragStart: Point | null = null;
let isPanning = false;
let panStart: Point | null = null;

const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return '✓ Saved';
    case 'saving': return '⏳ Saving…';
    case 'modified': return '● Modified';
    default: return '';
  }
});

const imageExtensions = [
  { label: 'Images', extensions: ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.bmp'] },
  { label: 'Project Files', extensions: ['.graphite.json'] },
];

const saveInitialPath = computed(() => {
  if (currentFilePath.value) {
    const parts = currentFilePath.value.split('/');
    parts.pop();
    return parts.join('/') || '/home';
  }
  return '/home';
});

/* ── Canvas Coordinate Helpers ── */

function canvasCoords(e: PointerEvent): Point {
  const canvas = canvasEl.value!;
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - panOffset.value.x) / zoomLevel.value,
    y: (e.clientY - rect.top - panOffset.value.y) / zoomLevel.value,
  };
}

/* ── Drawing ── */

function onPointerDown(e: PointerEvent) {
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    // Middle click or Alt+click = pan
    isPanning = true;
    panStart = { x: e.clientX - panOffset.value.x, y: e.clientY - panOffset.value.y };
    return;
  }

  const pt = canvasCoords(e);

  if (currentTool.value === 'select') {
    // Find shape under cursor
    selectedShapeId = -1;
    for (let i = shapes.value.length - 1; i >= 0; i--) {
      if (hitTest(shapes.value[i], pt)) {
        selectedShapeId = shapes.value[i].id;
        dragStart = pt;
        break;
      }
    }
    render();
    return;
  }

  if (currentTool.value === 'eraser') {
    for (let i = shapes.value.length - 1; i >= 0; i--) {
      if (hitTest(shapes.value[i], pt)) {
        pushUndo();
        shapes.value.splice(i, 1);
        saveStatus.value = 'modified';
        render();
        break;
      }
    }
    return;
  }

  if (currentTool.value === 'text') {
    const text = prompt('Enter text:');
    if (text) {
      pushUndo();
      shapes.value.push({
        id: ++shapeIdCounter,
        type: 'text',
        x: pt.x, y: pt.y,
        text,
        fontSize: fontSize.value,
        strokeColor: strokeColor.value,
        fillColor: fillColor.value,
        useFill: true,
        strokeWidth: strokeWidth.value,
      });
      saveStatus.value = 'modified';
      render();
    }
    return;
  }

  isDrawing = true;
  pushUndo();

  if (currentTool.value === 'pen') {
    currentShape = {
      id: ++shapeIdCounter,
      type: 'path',
      points: [pt],
      strokeColor: strokeColor.value,
      fillColor: fillColor.value,
      useFill: false,
      strokeWidth: strokeWidth.value,
    };
  } else if (currentTool.value === 'line') {
    currentShape = {
      id: ++shapeIdCounter,
      type: 'line',
      x: pt.x, y: pt.y,
      x2: pt.x, y2: pt.y,
      strokeColor: strokeColor.value,
      fillColor: fillColor.value,
      useFill: false,
      strokeWidth: strokeWidth.value,
    };
  } else if (currentTool.value === 'rect') {
    currentShape = {
      id: ++shapeIdCounter,
      type: 'rect',
      x: pt.x, y: pt.y,
      width: 0, height: 0,
      strokeColor: strokeColor.value,
      fillColor: fillColor.value,
      useFill: useFill.value,
      strokeWidth: strokeWidth.value,
    };
  } else if (currentTool.value === 'ellipse') {
    currentShape = {
      id: ++shapeIdCounter,
      type: 'ellipse',
      x: pt.x, y: pt.y,
      width: 0, height: 0,
      strokeColor: strokeColor.value,
      fillColor: fillColor.value,
      useFill: useFill.value,
      strokeWidth: strokeWidth.value,
    };
  }

  if (currentShape) {
    shapes.value.push(currentShape);
  }
}

function onPointerMove(e: PointerEvent) {
  if (isPanning && panStart) {
    panOffset.value = {
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    };
    render();
    return;
  }

  if (currentTool.value === 'select' && dragStart && selectedShapeId >= 0) {
    const pt = canvasCoords(e);
    const dx = pt.x - dragStart.x;
    const dy = pt.y - dragStart.y;
    const shape = shapes.value.find(s => s.id === selectedShapeId);
    if (shape) {
      moveShape(shape, dx, dy);
      dragStart = pt;
      saveStatus.value = 'modified';
      render();
    }
    return;
  }

  if (!isDrawing || !currentShape) return;

  const pt = canvasCoords(e);

  if (currentShape.type === 'path' && currentShape.points) {
    currentShape.points.push(pt);
  } else if (currentShape.type === 'line') {
    currentShape.x2 = pt.x;
    currentShape.y2 = pt.y;
  } else if (currentShape.type === 'rect' || currentShape.type === 'ellipse') {
    currentShape.width = pt.x - (currentShape.x || 0);
    currentShape.height = pt.y - (currentShape.y || 0);
  }

  render();
}

function onPointerUp() {
  if (isPanning) {
    isPanning = false;
    panStart = null;
    return;
  }

  if (currentTool.value === 'select') {
    dragStart = null;
    return;
  }

  if (isDrawing) {
    isDrawing = false;
    currentShape = null;
    saveStatus.value = 'modified';
    render();
  }
}

function onWheel(e: WheelEvent) {
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  zoomLevel.value = Math.max(0.1, Math.min(10, zoomLevel.value * factor));
  render();
}

/* ── Hit testing ── */

function hitTest(shape: Shape, pt: Point): boolean {
  const margin = 8;
  switch (shape.type) {
    case 'rect':
    case 'image': {
      const x = Math.min(shape.x || 0, (shape.x || 0) + (shape.width || 0));
      const y = Math.min(shape.y || 0, (shape.y || 0) + (shape.height || 0));
      const w = Math.abs(shape.width || 0);
      const h = Math.abs(shape.height || 0);
      return pt.x >= x - margin && pt.x <= x + w + margin && pt.y >= y - margin && pt.y <= y + h + margin;
    }
    case 'ellipse': {
      const cx = (shape.x || 0) + (shape.width || 0) / 2;
      const cy = (shape.y || 0) + (shape.height || 0) / 2;
      const rx = Math.abs(shape.width || 0) / 2 + margin;
      const ry = Math.abs(shape.height || 0) / 2 + margin;
      if (rx === 0 || ry === 0) return false;
      return ((pt.x - cx) ** 2) / (rx ** 2) + ((pt.y - cy) ** 2) / (ry ** 2) <= 1;
    }
    case 'line': {
      const dx = (shape.x2 || 0) - (shape.x || 0);
      const dy = (shape.y2 || 0) - (shape.y || 0);
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return false;
      const t = Math.max(0, Math.min(1, ((pt.x - (shape.x || 0)) * dx + (pt.y - (shape.y || 0)) * dy) / (len * len)));
      const projX = (shape.x || 0) + t * dx;
      const projY = (shape.y || 0) + t * dy;
      const dist = Math.sqrt((pt.x - projX) ** 2 + (pt.y - projY) ** 2);
      return dist <= margin + shape.strokeWidth;
    }
    case 'path': {
      if (!shape.points || shape.points.length < 2) return false;
      for (let i = 1; i < shape.points.length; i++) {
        const a = shape.points[i - 1];
        const b = shape.points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) continue;
        const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (len * len)));
        const projX = a.x + t * dx;
        const projY = a.y + t * dy;
        const dist = Math.sqrt((pt.x - projX) ** 2 + (pt.y - projY) ** 2);
        if (dist <= margin + shape.strokeWidth) return true;
      }
      return false;
    }
    case 'text': {
      const w = (shape.text?.length || 0) * (shape.fontSize || 24) * 0.6;
      const h = (shape.fontSize || 24);
      return pt.x >= (shape.x || 0) - margin && pt.x <= (shape.x || 0) + w + margin &&
             pt.y >= (shape.y || 0) - h - margin && pt.y <= (shape.y || 0) + margin;
    }
  }
  return false;
}

function moveShape(shape: Shape, dx: number, dy: number) {
  if (shape.x !== undefined) shape.x += dx;
  if (shape.y !== undefined) shape.y += dy;
  if (shape.x2 !== undefined) shape.x2 += dx;
  if (shape.y2 !== undefined) shape.y2 += dy;
  if (shape.points) {
    for (const p of shape.points) {
      p.x += dx;
      p.y += dy;
    }
  }
}

/* ── Undo/Redo ── */

function pushUndo() {
  undoStack.value.push(JSON.parse(JSON.stringify(shapes.value)));
  redoStack.value = [];
  // Limit undo history
  if (undoStack.value.length > 50) undoStack.value.shift();
}

function undo() {
  if (undoStack.value.length === 0) return;
  redoStack.value.push(JSON.parse(JSON.stringify(shapes.value)));
  shapes.value = undoStack.value.pop()!;
  saveStatus.value = 'modified';
  render();
}

function redo() {
  if (redoStack.value.length === 0) return;
  undoStack.value.push(JSON.parse(JSON.stringify(shapes.value)));
  shapes.value = redoStack.value.pop()!;
  saveStatus.value = 'modified';
  render();
}

/* ── Rendering ── */

function render() {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d')!;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = '#2d2d2d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw checkerboard for canvas area
  ctx.save();
  ctx.translate(panOffset.value.x, panOffset.value.y);
  ctx.scale(zoomLevel.value, zoomLevel.value);

  // White canvas background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value);

  // Draw checkerboard pattern
  const checkSize = 16;
  ctx.fillStyle = '#f0f0f0';
  for (let y = 0; y < canvasHeight.value; y += checkSize * 2) {
    for (let x = 0; x < canvasWidth.value; x += checkSize * 2) {
      ctx.fillRect(x + checkSize, y, checkSize, checkSize);
      ctx.fillRect(x, y + checkSize, checkSize, checkSize);
    }
  }

  // Draw shapes
  for (const shape of shapes.value) {
    drawShape(ctx, shape);
  }

  // Draw selection
  if (selectedShapeId >= 0) {
    const sel = shapes.value.find(s => s.id === selectedShapeId);
    if (sel) drawSelectionBox(ctx, sel);
  }

  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape) {
  ctx.save();
  ctx.strokeStyle = shape.strokeColor;
  ctx.fillStyle = shape.fillColor;
  ctx.lineWidth = shape.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (shape.type) {
    case 'path':
      if (shape.points && shape.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
          ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        ctx.stroke();
      }
      break;

    case 'line':
      ctx.beginPath();
      ctx.moveTo(shape.x || 0, shape.y || 0);
      ctx.lineTo(shape.x2 || 0, shape.y2 || 0);
      ctx.stroke();
      break;

    case 'rect':
      if (shape.useFill) {
        ctx.fillRect(shape.x || 0, shape.y || 0, shape.width || 0, shape.height || 0);
      }
      ctx.strokeRect(shape.x || 0, shape.y || 0, shape.width || 0, shape.height || 0);
      break;

    case 'ellipse': {
      const cx = (shape.x || 0) + (shape.width || 0) / 2;
      const cy = (shape.y || 0) + (shape.height || 0) / 2;
      const rx = Math.abs(shape.width || 0) / 2;
      const ry = Math.abs(shape.height || 0) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (shape.useFill) ctx.fill();
      ctx.stroke();
      break;
    }

    case 'text':
      ctx.font = `${shape.fontSize || 24}px sans-serif`;
      ctx.fillStyle = shape.strokeColor;
      ctx.fillText(shape.text || '', shape.x || 0, shape.y || 0);
      break;

    case 'image':
      // Image shapes loaded from imported files
      if (shape.imageData) {
        const img = new Image();
        img.src = shape.imageData;
        ctx.drawImage(img, shape.x || 0, shape.y || 0, shape.width || 100, shape.height || 100);
      }
      break;
  }

  ctx.restore();
}

function drawSelectionBox(ctx: CanvasRenderingContext2D, shape: Shape) {
  ctx.save();
  ctx.strokeStyle = '#007acc';
  ctx.lineWidth = 1 / zoomLevel.value;
  ctx.setLineDash([4 / zoomLevel.value, 4 / zoomLevel.value]);

  let x = 0, y = 0, w = 0, h = 0;
  if (shape.type === 'rect' || shape.type === 'ellipse' || shape.type === 'image') {
    x = Math.min(shape.x || 0, (shape.x || 0) + (shape.width || 0));
    y = Math.min(shape.y || 0, (shape.y || 0) + (shape.height || 0));
    w = Math.abs(shape.width || 0);
    h = Math.abs(shape.height || 0);
  } else if (shape.type === 'path' && shape.points && shape.points.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of shape.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    x = minX; y = minY; w = maxX - minX; h = maxY - minY;
  } else if (shape.type === 'line') {
    x = Math.min(shape.x || 0, shape.x2 || 0);
    y = Math.min(shape.y || 0, shape.y2 || 0);
    w = Math.abs((shape.x2 || 0) - (shape.x || 0));
    h = Math.abs((shape.y2 || 0) - (shape.y || 0));
  } else if (shape.type === 'text') {
    x = shape.x || 0;
    y = (shape.y || 0) - (shape.fontSize || 24);
    w = (shape.text?.length || 0) * (shape.fontSize || 24) * 0.6;
    h = shape.fontSize || 24;
  }

  const m = 4 / zoomLevel.value;
  ctx.strokeRect(x - m, y - m, w + m * 2, h + m * 2);
  ctx.restore();
}

/* ── File operations ── */

function getInitialPath(): string | null {
  try {
    const ctx = (window.parent as Record<string, unknown>).__STARK_CONTEXT__ as
      { args?: string[] } | undefined;
    const arg = ctx?.args?.[0];
    if (arg && typeof arg === 'string' && arg.trim().length > 0) return arg.trim();
  } catch { /* cross-origin */ }
  return null;
}

async function loadImageFile(path: string) {
  if (!opfsRoot) return;
  try {
    const fh = await getFileHandle(opfsRoot, path);
    const file = await fh.getFile();

    if (path.endsWith('.graphite.json')) {
      // Load project file
      const text = await file.text();
      const project = JSON.parse(text);
      if (project.shapes) shapes.value = project.shapes;
      if (project.canvasWidth) canvasWidth.value = project.canvasWidth;
      if (project.canvasHeight) canvasHeight.value = project.canvasHeight;
      currentFilePath.value = normalizePath(path);
      saveStatus.value = 'saved';
    } else {
      // Load as image
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });

      // Convert to base64 for storage
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.drawImage(img, 0, 0);
      const dataUrl = tempCanvas.toDataURL('image/png');

      pushUndo();
      shapes.value.push({
        id: ++shapeIdCounter,
        type: 'image',
        x: 0, y: 0,
        width: img.width, height: img.height,
        imageData: dataUrl,
        strokeColor: '#000000',
        fillColor: '#000000',
        useFill: false,
        strokeWidth: 0,
      });

      canvasWidth.value = Math.max(canvasWidth.value, img.width);
      canvasHeight.value = Math.max(canvasHeight.value, img.height);
      currentFilePath.value = normalizePath(path);
      URL.revokeObjectURL(url);
    }

    render();
  } catch (e) {
    console.warn('Failed to load file:', path, e);
  }
}

async function saveFile() {
  if (currentFilePath.value && currentFilePath.value.endsWith('.graphite.json')) {
    await saveProjectToPath(currentFilePath.value);
  } else {
    saveMode = 'save-project';
    savePickerTitle.value = 'Save Project';
    savePickerExtensions.value = [{ label: 'Graphite Project', extensions: ['.graphite.json'] }];
    saveDefaultName.value = currentFilePath.value
      ? currentFilePath.value.split('/').pop()?.replace(/\.[^.]+$/, '') || 'drawing'
      : 'drawing';
    showSavePicker.value = true;
  }
}

function saveAsFile() {
  saveMode = 'save-project';
  savePickerTitle.value = 'Save Project As';
  savePickerExtensions.value = [{ label: 'Graphite Project', extensions: ['.graphite.json'] }];
  saveDefaultName.value = 'drawing';
  showSavePicker.value = true;
}

function exportPng() {
  saveMode = 'export-png';
  savePickerTitle.value = 'Export as PNG';
  savePickerExtensions.value = [{ label: 'PNG Image', extensions: ['.png'] }];
  saveDefaultName.value = 'export';
  showSavePicker.value = true;
}

async function saveProjectToPath(path: string) {
  if (!opfsRoot) return;
  try {
    saveStatus.value = 'saving';
    const project = {
      version: 1,
      canvasWidth: canvasWidth.value,
      canvasHeight: canvasHeight.value,
      shapes: shapes.value,
    };
    const fh = await getFileHandle(opfsRoot, path, true);
    const writable = await fh.createWritable();
    await writable.write(new TextEncoder().encode(JSON.stringify(project)));
    await writable.close();
    currentFilePath.value = normalizePath(path);
    saveStatus.value = 'saved';
  } catch (e) {
    console.warn('Failed to save project:', e);
    saveStatus.value = 'modified';
  }
}

async function exportPngToPath(path: string) {
  if (!opfsRoot) return;
  try {
    saveStatus.value = 'saving';
    // Render to offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreen.width = canvasWidth.value;
    offscreen.height = canvasHeight.value;
    const ctx = offscreen.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    for (const shape of shapes.value) {
      drawShape(ctx, shape);
    }

    const blob = await new Promise<Blob | null>(resolve => offscreen.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to create PNG blob');

    const fh = await getFileHandle(opfsRoot, path, true);
    const writable = await fh.createWritable();
    await writable.write(blob);
    await writable.close();
    saveStatus.value = 'saved';
  } catch (e) {
    console.warn('Failed to export PNG:', e);
    saveStatus.value = 'modified';
  }
}

function openFilePicker() { showOpenPicker.value = true; }

function newCanvas() {
  shapes.value = [];
  undoStack.value = [];
  redoStack.value = [];
  currentFilePath.value = '';
  selectedShapeId = -1;
  canvasWidth.value = 1200;
  canvasHeight.value = 800;
  saveStatus.value = 'idle';
  render();
}

async function onFileSelected(result: { paths: string[] }) {
  if (result.paths.length > 0) {
    await loadImageFile(result.paths[0]);
  }
}

async function onSaveSelected(result: { paths: string[] }) {
  if (result.paths.length === 0) return;
  if (saveMode === 'export-png') {
    await exportPngToPath(result.paths[0]);
  } else {
    await saveProjectToPath(result.paths[0]);
  }
}

/* ── Keyboard shortcuts ── */

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); undo(); }
  if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); redo(); }
  if (e.key === 'y' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); redo(); }
  if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveFile(); }
  if (e.key === 'o' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openFilePicker(); }
  if (e.key === 'n' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); newCanvas(); }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedShapeId >= 0) {
      pushUndo();
      shapes.value = shapes.value.filter(s => s.id !== selectedShapeId);
      selectedShapeId = -1;
      saveStatus.value = 'modified';
      render();
    }
  }

  // Tool shortcuts
  if (!e.ctrlKey && !e.metaKey) {
    if (e.key === 'v') currentTool.value = 'select';
    if (e.key === 'p') currentTool.value = 'pen';
    if (e.key === 'l') currentTool.value = 'line';
    if (e.key === 'r') currentTool.value = 'rect';
    if (e.key === 'e') currentTool.value = 'ellipse';
    if (e.key === 't') currentTool.value = 'text';
    if (e.key === 'x') currentTool.value = 'eraser';
  }
}

/* ── Canvas resizing ── */

function resizeCanvas() {
  const canvas = canvasEl.value;
  const area = canvasArea.value;
  if (!canvas || !area) return;
  canvas.width = area.clientWidth;
  canvas.height = area.clientHeight;
  render();
}

/* ── Lifecycle ── */

onMounted(async () => {
  opfsRoot = await getStarkOpfsRoot();
  document.addEventListener('keydown', onKeydown);

  await nextTick();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const initialPath = getInitialPath();
  if (initialPath) {
    await loadImageFile(initialPath);
  } else {
    render();
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', resizeCanvas);
});
</script>

<style scoped>
.graphite {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #1e1e1e;
  color: #d4d4d4;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: #2d2d2d;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
  gap: 8px;
}

.top-left, .top-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.app-title {
  font-weight: 600;
  font-size: 13px;
  margin-right: 8px;
}

.bar-btn {
  background: none;
  border: 1px solid transparent;
  color: #ccc;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
  white-space: nowrap;
}
.bar-btn:hover { background: #3c3c3c; }
.bar-btn:disabled { opacity: 0.4; cursor: default; }

.status-text {
  font-size: 11px;
  color: #888;
  margin-left: 8px;
}
.status-text.saved { color: #4ec9b0; }
.status-text.saving { color: #dcdcaa; }
.status-text.modified { color: #ce9178; }

/* Tool bar */
.tool-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.tool-btn {
  width: 32px;
  height: 28px;
  background: none;
  border: 1px solid transparent;
  color: #ccc;
  cursor: pointer;
  border-radius: 3px;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tool-btn:hover { background: #3c3c3c; }
.tool-btn.active { background: #094771; border-color: #007acc; }

.tool-sep {
  width: 1px;
  height: 20px;
  background: #444;
  margin: 0 6px;
}

.tool-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #aaa;
  margin-left: 4px;
}

.color-input {
  width: 24px;
  height: 22px;
  padding: 0;
  border: 1px solid #555;
  border-radius: 3px;
  cursor: pointer;
  background: none;
}

.num-input {
  width: 45px;
  background: #3c3c3c;
  border: 1px solid #555;
  color: #ccc;
  padding: 2px 4px;
  font-size: 11px;
  border-radius: 3px;
  outline: none;
}
.num-input:focus { border-color: #007acc; }

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
}

/* Canvas area */
.canvas-area {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.drawing-canvas {
  width: 100%;
  height: 100%;
  cursor: crosshair;
  display: block;
}

/* Status bar */
.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 2px 12px;
  background: #007acc;
  color: #fff;
  font-size: 11px;
  flex-shrink: 0;
}
</style>
