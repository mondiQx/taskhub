<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useTaskStore } from "../stores/taskStore";

const emit = defineEmits<{ open: [id: string]; "open-note": [folder: string, id: string] }>();

const taskStore = useTaskStore();

watch(
  () => taskStore.showDone,
  () => {
    filterCacheKey = "";
    draw();
  },
);

interface GraphNode {
  id: string;
  label: string;
  folder: string;
  taskId?: string;
  color?: string;
  status?: string;
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

// Mirrors NOTE_TYPE_COLORS in apps/server/src/vault/graph.ts — labels only, not
// toggleable like the folder legend (notes of any type still live in "notes").
const NOTE_TYPE_LEGEND: { label: string; color: string }[] = [
  { label: "person", color: "#b0559e" },
  { label: "meeting-hub", color: "#3d6ba8" },
  { label: "initiative/team hub", color: "#4a7c59" },
];

const canvasRef = ref<HTMLCanvasElement>();
const nodes = ref<GraphNode[]>([]);
const edges = ref<GraphEdge[]>([]);
const hovered = ref<GraphNode | null>(null);
const activeFolders = ref(new Set(Object.keys(FOLDER_COLORS)));
const searchQuery = ref("");
const focusIds = ref<Set<string> | null>(null);
const hideNonFocused = ref(false);

let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let dragging: GraphNode | null = null;
let dragStart = { x: 0, y: 0 };
let dragMoved = false;
let panX = 0;
let panY = 0;
let adjacency = new Map<string, Set<string>>();
// Zoom-to-fit camera applied only while search-hiding is active, so the
// surviving focused nodes expand to fill the canvas instead of leaving the
// gaps where hidden nodes used to be. Identity (scale 1, centered) otherwise.
let camera = { scale: 1, cx: 0, cy: 0 };
let simRunning = false;
let settledFrames = 0;
const SETTLE_ENERGY_THRESHOLD = 0.05;
const SETTLE_FRAMES_NEEDED = 20;

let filterCacheKey = "";
let cachedVisible = new Set<string>();
let cachedById = new Map<string, GraphNode>();
let cachedDegree = new Map<string, number>();

function getFilteredCaches() {
  const key = `${[...activeFolders.value].sort().join(",")}|${taskStore.showDone}|${nodes.value.length}|${edges.value.length}`;
  if (key === filterCacheKey) return { visible: cachedVisible, byId: cachedById, degree: cachedDegree };
  filterCacheKey = key;
  cachedById = new Map(nodes.value.map((n) => [n.id, n]));
  cachedVisible = new Set(
    nodes.value
      .filter((n) => activeFolders.value.has(n.folder) && (taskStore.showDone || n.status !== "done"))
      .map((n) => n.id),
  );
  cachedDegree = new Map<string, number>();
  for (const e of edges.value) {
    cachedDegree.set(e.source, (cachedDegree.get(e.source) ?? 0) + 1);
    cachedDegree.set(e.target, (cachedDegree.get(e.target) ?? 0) + 1);
  }
  return { visible: cachedVisible, byId: cachedById, degree: cachedDegree };
}

function wakeSimulation() {
  settledFrames = 0;
  if (!simRunning) {
    simRunning = true;
    raf = requestAnimationFrame(step);
  }
}

function neighborhoodOf(ids: string[]): Set<string> {
  const set = new Set<string>();
  for (const id of ids) {
    set.add(id);
    for (const neighbor of adjacency.get(id) ?? []) set.add(neighbor);
  }
  return set;
}

function updateSearchFocus() {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) {
    focusIds.value = null;
    hideNonFocused.value = false;
    return;
  }
  const matches = nodes.value.filter((n) => n.label.toLowerCase().includes(query)).map((n) => n.id);
  focusIds.value = neighborhoodOf(matches);
  hideNonFocused.value = true;
}

function resize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  wakeSimulation();
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
      // Clamped well above 0 so near-coincident nodes (e.g. right after load) repel firmly
      // instead of producing a near-infinite force spike on the first few frames.
      const distSq = Math.max(dx * dx + dy * dy, 100);
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
  const maxSpeed = 8;
  let energy = 0;
  for (const n of nodes.value) {
    if (n === dragging) continue;
    n.vx += (cx - n.x) * 0.001;
    n.vy += (cy - n.y) * 0.001;
    n.vx *= 0.85;
    n.vy *= 0.85;

    // Speed cap keeps the initial settle calm — without it, nodes that start
    // stacked on top of each other can rocket across the canvas on frame one.
    const speed = Math.hypot(n.vx, n.vy);
    if (speed > maxSpeed) {
      n.vx = (n.vx / speed) * maxSpeed;
      n.vy = (n.vy / speed) * maxSpeed;
    }

    n.x += n.vx;
    n.y += n.vy;

    // keep every node inside the visible canvas — bounce off the edge instead of drifting offscreen
    if (n.x < margin) { n.x = margin; n.vx = Math.abs(n.vx) * 0.4; }
    else if (n.x > w - margin) { n.x = w - margin; n.vx = -Math.abs(n.vx) * 0.4; }
    if (n.y < margin) { n.y = margin; n.vy = Math.abs(n.vy) * 0.4; }
    else if (n.y > h - margin) { n.y = h - margin; n.vy = -Math.abs(n.vy) * 0.4; }

    energy += n.vx * n.vx + n.vy * n.vy;
  }

  draw();

  if (energy < SETTLE_ENERGY_THRESHOLD) settledFrames++;
  else settledFrames = 0;

  if (settledFrames >= SETTLE_FRAMES_NEEDED) {
    simRunning = false;
    return;
  }
  raf = requestAnimationFrame(step);
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const { visible, byId, degree } = getFilteredCaches();

  const focus = focusIds.value;
  const DIM_ALPHA = 0.15;

  if (hideNonFocused.value && focus && focus.size) {
    const pts = nodes.value.filter((n) => visible.has(n.id) && focus.has(n.id));
    if (pts.length) {
      const minX = Math.min(...pts.map((p) => p.x));
      const maxX = Math.max(...pts.map((p) => p.x));
      const minY = Math.min(...pts.map((p) => p.y));
      const maxY = Math.max(...pts.map((p) => p.y));
      const pad = 70;
      const scale = Math.min(
        (canvas.width - pad * 2) / Math.max(maxX - minX, 1),
        (canvas.height - pad * 2) / Math.max(maxY - minY, 1),
        3,
      );
      camera = { scale: Math.max(scale, 0.4), cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    }
  } else {
    camera = { scale: 1, cx: canvas.width / 2, cy: canvas.height / 2 };
  }

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.cx, -camera.cy);

  ctx.lineWidth = 1 / camera.scale;
  for (const e of edges.value) {
    if (!visible.has(e.source) || !visible.has(e.target)) continue;
    const edgeFocused = !focus || (focus.has(e.source) && focus.has(e.target));
    if (!edgeFocused && hideNonFocused.value) continue;
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    ctx.globalAlpha = edgeFocused ? 1 : DIM_ALPHA;
    ctx.strokeStyle = "rgba(120,110,95,0.35)";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const n of nodes.value) {
    if (!visible.has(n.id)) continue;
    const isFocused = !focus || focus.has(n.id);
    if (!isFocused && hideNonFocused.value) continue;
    ctx.globalAlpha = isFocused ? 1 : DIM_ALPHA;
    const r = 4 + Math.min(degree.get(n.id) ?? 0, 10) * 1.2;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = n.color ?? FOLDER_COLORS[n.folder] ?? "#888";
    ctx.fill();
    if (n === hovered.value && isFocused) {
      ctx.strokeStyle = "#2f2a24";
      ctx.lineWidth = 2 / camera.scale;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Labels are drawn in screen space (after restore) so font size stays
  // constant regardless of zoom level.
  function toScreen(n: GraphNode) {
    return {
      x: (n.x - camera.cx) * camera.scale + canvas!.width / 2,
      y: (n.y - camera.cy) * camera.scale + canvas!.height / 2,
    };
  }

  function drawLabel(n: GraphNode) {
    const { x, y } = toScreen(n);
    ctx!.font = "12px system-ui, sans-serif";
    const text = n.label;
    const padding = 6;
    const tw = ctx!.measureText(text).width;
    ctx!.fillStyle = "rgba(47,42,36,0.9)";
    ctx!.fillRect(x + 10, y - 10, tw + padding * 2, 20);
    ctx!.fillStyle = "#fff";
    ctx!.fillText(text, x + 10 + padding, y + 4);
  }

  if (focus) {
    for (const n of nodes.value) {
      if (visible.has(n.id) && focus.has(n.id)) drawLabel(n);
    }
  } else if (hovered.value) {
    drawLabel(hovered.value);
  }
}

function nodeAt(x: number, y: number): GraphNode | null {
  const hitRadius = 15 / camera.scale;
  for (let i = nodes.value.length - 1; i >= 0; i--) {
    const n = nodes.value[i];
    if (!activeFolders.value.has(n.folder) || (!taskStore.showDone && n.status === "done")) continue;
    const dx = n.x - x;
    const dy = n.y - y;
    if (dx * dx + dy * dy < hitRadius * hitRadius) return n;
  }
  return null;
}

function toLocal(evt: MouseEvent) {
  const rect = canvasRef.value!.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

// Screen-space (canvas pixel) coordinates -> world-space (node) coordinates,
// inverting the zoom-to-fit camera transform applied in draw().
function toWorld(x: number, y: number) {
  const canvas = canvasRef.value!;
  return {
    x: (x - canvas.width / 2) / camera.scale + camera.cx,
    y: (y - canvas.height / 2) / camera.scale + camera.cy,
  };
}

const DRAG_THRESHOLD = 4;

function onMouseDown(evt: MouseEvent) {
  const local = toLocal(evt);
  const { x, y } = toWorld(local.x, local.y);
  dragging = nodeAt(x, y);
  dragStart = { x, y };
  dragMoved = false;
  if (dragging) {
    focusIds.value = neighborhoodOf([dragging.id]);
    hideNonFocused.value = false;
    wakeSimulation();
  }
}

function onMouseMove(evt: MouseEvent) {
  const local = toLocal(evt);
  const { x, y } = toWorld(local.x, local.y);
  if (dragging) {
    if (!dragMoved) {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) dragMoved = true;
    }
    dragging.x = x;
    dragging.y = y;
    dragging.vx = 0;
    dragging.vy = 0;
    wakeSimulation();
    return;
  }
  hovered.value = nodeAt(x, y);
  canvasRef.value!.style.cursor = hovered.value ? "pointer" : "default";
}

function onMouseUp() {
  dragging = null;
}

function onClick(evt: MouseEvent) {
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  const local = toLocal(evt);
  const { x, y } = toWorld(local.x, local.y);
  const n = nodeAt(x, y);
  if (!n) {
    if (!searchQuery.value.trim()) {
      focusIds.value = null;
      hideNonFocused.value = false;
    }
    return;
  }
  if (n.taskId) emit("open", n.taskId);
  else if (n.folder !== "category") emit("open-note", n.folder, n.id);
}

const matchCount = computed(() => {
  if (!searchQuery.value.trim()) return null;
  const query = searchQuery.value.trim().toLowerCase();
  return nodes.value.filter((n) => n.label.toLowerCase().includes(query)).length;
});

function toggleFolder(folder: string) {
  if (activeFolders.value.has(folder)) activeFolders.value.delete(folder);
  else activeFolders.value.add(folder);
  filterCacheKey = "";
  draw();
}

// Golden-angle spiral — spreads nodes out from the center with no overlap and no
// randomness, so the physics starts from a calm, evenly-distributed layout instead
// of a tight random cluster that explodes outward once the sim kicks in.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

async function load() {
  const res = await fetch("/api/graph");
  const data: { nodes: Omit<GraphNode, "x" | "y" | "vx" | "vy">[]; edges: GraphEdge[] } = await res.json();
  const canvas = canvasRef.value!;
  nodes.value = data.nodes.map((n, i) => {
    const r = 8 * Math.sqrt(i + 1);
    const theta = i * GOLDEN_ANGLE;
    return markRaw({
      ...n,
      x: canvas.width / 2 + r * Math.cos(theta),
      y: canvas.height / 2 + r * Math.sin(theta),
      vx: 0,
      vy: 0,
    });
  });
  edges.value = data.edges;

  adjacency = new Map();
  for (const e of edges.value) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
    if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
    adjacency.get(e.source)!.add(e.target);
    adjacency.get(e.target)!.add(e.source);
  }
  filterCacheKey = "";
  wakeSimulation();
}

onMounted(async () => {
  ctx = canvasRef.value!.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
  await load();
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
    <div class="search-box">
      <input v-model="searchQuery" type="text" placeholder="Search nodes…" @input="updateSearchFocus" />
      <span v-if="matchCount !== null" class="match-count">
        {{ matchCount === 0 ? "no matches" : `${matchCount} match${matchCount === 1 ? "" : "es"}` }}
      </span>
    </div>
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
      <div class="legend-subgroup">
        <span v-for="t in NOTE_TYPE_LEGEND" :key="t.label" class="legend-item sub">
          <span class="dot" :style="{ background: t.color }" />
          {{ t.label }}
        </span>
      </div>
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
.search-box {
  position: absolute; top: 0.75rem; right: 0.75rem; display: flex; align-items: center; gap: 0.5rem;
  background: rgba(255,255,255,0.85); padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.8rem;
}
.search-box input {
  border: 1px solid rgba(47,42,36,0.2); border-radius: 6px; padding: 0.3rem 0.5rem; font-size: 0.8rem;
  background: #fff; color: #2f2a24; outline: none; width: 160px;
}
.match-count { opacity: 0.65; white-space: nowrap; }
.legend-item {
  display: flex; align-items: center; gap: 0.4rem; background: none; border: none; cursor: pointer;
  padding: 0.1rem 0; color: #2f2a24; text-transform: capitalize;
}
.legend-item.off { opacity: 0.35; }
.legend-item.sub { cursor: default; font-size: 0.75rem; opacity: 0.85; }
.legend-subgroup { display: flex; flex-direction: column; gap: 0.3rem; padding-left: 0.9rem; border-left: 2px solid rgba(47,42,36,0.15); margin-left: 0.15rem; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.count { margin-left: auto; opacity: 0.6; }
</style>
