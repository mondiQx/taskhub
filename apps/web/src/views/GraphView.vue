<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const emit = defineEmits<{ open: [id: string]; "open-note": [folder: string, id: string] }>();

interface GraphNode {
  id: string;
  label: string;
  folder: string;
  taskId?: string;
  color?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface GraphEdge {
  source: string;
  target: string;
}

const FOLDER_COLORS: Record<string, string> = {
  tasks: "#d97757",
  notes: "#4a7c59",
  meetings: "#3d6ba8",
  journal: "#a8863d",
  reports: "#8b5a9e",
  category: "#5b5b5b",
};

const canvasRef = ref<HTMLCanvasElement>();
const nodes = ref<GraphNode[]>([]);
const edges = ref<GraphEdge[]>([]);
const hovered = ref<GraphNode | null>(null);
const activeFolders = ref(new Set(Object.keys(FOLDER_COLORS)));

let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let dragging: GraphNode | null = null;
let panX = 0;
let panY = 0;

function resize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}

function step() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;

  const byId = new Map(nodes.value.map((n) => [n.id, n]));

  // repulsion between all pairs
  for (let i = 0; i < nodes.value.length; i++) {
    const a = nodes.value[i];
    for (let j = i + 1; j < nodes.value.length; j++) {
      const b = nodes.value[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distSq = Math.max(dx * dx + dy * dy, 1);
      const force = 1800 / distSq;
      const dist = Math.sqrt(distSq);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // spring attraction along edges
  for (const e of edges.value) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const force = (dist - 90) * 0.02;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // gentle pull to center + damping + integrate
  const margin = 24;
  for (const n of nodes.value) {
    if (n === dragging) continue;
    n.vx += (cx - n.x) * 0.001;
    n.vy += (cy - n.y) * 0.001;
    n.vx *= 0.85;
    n.vy *= 0.85;
    n.x += n.vx;
    n.y += n.vy;

    // keep every node inside the visible canvas — bounce off the edge instead of drifting offscreen
    if (n.x < margin) { n.x = margin; n.vx = Math.abs(n.vx) * 0.4; }
    else if (n.x > w - margin) { n.x = w - margin; n.vx = -Math.abs(n.vx) * 0.4; }
    if (n.y < margin) { n.y = margin; n.vy = Math.abs(n.vy) * 0.4; }
    else if (n.y > h - margin) { n.y = h - margin; n.vy = -Math.abs(n.vy) * 0.4; }
  }

  draw();
  raf = requestAnimationFrame(step);
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const visible = new Set(nodes.value.filter((n) => activeFolders.value.has(n.folder)).map((n) => n.id));
  const byId = new Map(nodes.value.map((n) => [n.id, n]));

  ctx.strokeStyle = "rgba(120,110,95,0.35)";
  ctx.lineWidth = 1;
  for (const e of edges.value) {
    if (!visible.has(e.source) || !visible.has(e.target)) continue;
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const degree = new Map<string, number>();
  for (const e of edges.value) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  for (const n of nodes.value) {
    if (!visible.has(n.id)) continue;
    const r = 4 + Math.min(degree.get(n.id) ?? 0, 10) * 1.2;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = n.color ?? FOLDER_COLORS[n.folder] ?? "#888";
    ctx.fill();
    if (n === hovered.value) {
      ctx.strokeStyle = "#2f2a24";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  if (hovered.value) {
    const n = hovered.value;
    ctx.font = "12px system-ui, sans-serif";
    const text = n.label;
    const padding = 6;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(47,42,36,0.9)";
    ctx.fillRect(n.x + 10, n.y - 10, tw + padding * 2, 20);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, n.x + 10 + padding, n.y + 4);
  }
}

function nodeAt(x: number, y: number): GraphNode | null {
  for (let i = nodes.value.length - 1; i >= 0; i--) {
    const n = nodes.value[i];
    if (!activeFolders.value.has(n.folder)) continue;
    const dx = n.x - x;
    const dy = n.y - y;
    if (dx * dx + dy * dy < 15 * 15) return n;
  }
  return null;
}

function toLocal(evt: MouseEvent) {
  const rect = canvasRef.value!.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

function onMouseDown(evt: MouseEvent) {
  const { x, y } = toLocal(evt);
  dragging = nodeAt(x, y);
}

function onMouseMove(evt: MouseEvent) {
  const { x, y } = toLocal(evt);
  if (dragging) {
    dragging.x = x;
    dragging.y = y;
    dragging.vx = 0;
    dragging.vy = 0;
    return;
  }
  hovered.value = nodeAt(x, y);
  canvasRef.value!.style.cursor = hovered.value ? "pointer" : "default";
}

function onMouseUp() {
  dragging = null;
}

function onClick(evt: MouseEvent) {
  const { x, y } = toLocal(evt);
  const n = nodeAt(x, y);
  if (!n) return;
  if (n.taskId) emit("open", n.taskId);
  else if (n.folder !== "category") emit("open-note", n.folder, n.id);
}

function toggleFolder(folder: string) {
  if (activeFolders.value.has(folder)) activeFolders.value.delete(folder);
  else activeFolders.value.add(folder);
}

async function load() {
  const res = await fetch("/api/graph");
  const data: { nodes: Omit<GraphNode, "x" | "y" | "vx" | "vy">[]; edges: GraphEdge[] } = await res.json();
  const canvas = canvasRef.value!;
  nodes.value = data.nodes.map((n) => ({
    ...n,
    x: canvas.width / 2 + (Math.random() - 0.5) * 200,
    y: canvas.height / 2 + (Math.random() - 0.5) * 200,
    vx: 0,
    vy: 0,
  }));
  edges.value = data.edges;
}

onMounted(async () => {
  ctx = canvasRef.value!.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
  await load();
  step();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  window.removeEventListener("resize", resize);
});
</script>

<template>
  <div class="graph">
    <canvas
      ref="canvasRef"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @click="onClick"
    />
    <div class="legend">
      <button
        v-for="(color, folder) in FOLDER_COLORS"
        :key="folder"
        class="legend-item"
        :class="{ off: !activeFolders.has(folder) }"
        @click="toggleFolder(folder)"
      >
        <span class="dot" :style="{ background: color }" />
        {{ folder }}
        <span class="count">{{ nodes.filter((n) => n.folder === folder).length }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.graph { position: relative; width: 100%; height: 100%; background: #f5f0e1; }
canvas { display: block; width: 100%; height: 100%; }
.legend {
  position: absolute; top: 0.75rem; left: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem;
  background: rgba(255,255,255,0.85); padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.8rem;
}
.legend-item {
  display: flex; align-items: center; gap: 0.4rem; background: none; border: none; cursor: pointer;
  padding: 0.1rem 0; color: #2f2a24; text-transform: capitalize;
}
.legend-item.off { opacity: 0.35; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.count { margin-left: auto; opacity: 0.6; }
</style>
