<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTaskStore } from "../stores/taskStore";
import { useMeetingsStore } from "../stores/meetingsStore";
import type { Meeting, Task } from "../types";

const emit = defineEmits<{ open: [id: string]; "open-meeting": [id: string] }>();

const taskStore = useTaskStore();
const meetingsStore = useMeetingsStore();
const loading = ref(true);
const expandedSeries = ref(new Set<string>());
const collapsedMonths = ref(new Set<string>());

onMounted(async () => {
  await meetingsStore.init();
  loading.value = false;
});

const meetings = computed(() => meetingsStore.meetings);

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface MonthGroup {
  key: string;
  label: string;
  meetings: Meeting[];
}

const recurringSeries = computed(() => meetingsStore.recurringSeries);

// The full view can afford a wider lookahead than the compact strip.
const UPCOMING_LOOKAHEAD_DAYS = 7;
const upcomingMeetings = computed(() => meetingsStore.upcomingItems(UPCOMING_LOOKAHEAD_DAYS));

// One-offs only — recurring series live in recurringSeries above. Split on
// "now" so future meetings surface in the Upcoming column instead of being
// buried at the top of the history column.
const nowIso = new Date().toISOString();

const monthGroups = computed<MonthGroup[]>(() => {
  const byMonth = new Map<string, Meeting[]>();
  for (const m of meetings.value) {
    if (m.recurringEventId) continue;
    if (m.start >= nowIso) continue; // upcoming — shown in its own column instead
    const key = monthKey(m.start);
    const list = byMonth.get(key) ?? [];
    list.push(m);
    byMonth.set(key, list);
  }

  return Array.from(byMonth.entries())
    .map(([key, ms]) => ({
      key,
      label: monthLabel(key),
      meetings: ms.sort((a, b) => b.start.localeCompare(a.start)),
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
});

function toggleSeries(key: string) {
  if (expandedSeries.value.has(key)) expandedSeries.value.delete(key);
  else expandedSeries.value.add(key);
  expandedSeries.value = new Set(expandedSeries.value);
}

function toggleMonth(key: string) {
  if (collapsedMonths.value.has(key)) collapsedMonths.value.delete(key);
  else collapsedMonths.value.add(key);
  collapsedMonths.value = new Set(collapsedMonths.value);
}

function linkedTask(meeting: Meeting): Task | undefined {
  return linkedTaskByEventId(meeting.eventId);
}

function linkedTaskByEventId(eventId?: string): Task | undefined {
  return taskStore.tasks.find(
    (t) =>
      t.relatedMeeting &&
      eventId &&
      (t.relatedMeeting.eventId === eventId || t.relatedMeeting.eventId === `gcal:${eventId}`),
  );
}
</script>

<template>
  <div class="meetings-view">
    <p v-if="loading" class="empty">Loading meetings…</p>

    <template v-else>
      <p v-if="!upcomingMeetings.length && !recurringSeries.length && !monthGroups.length" class="empty">
        No cached meetings yet.
      </p>

      <div v-else class="columns">
        <section class="column">
          <h2>Upcoming</h2>
          <p v-if="!upcomingMeetings.length" class="empty column-empty">Nothing on the calendar yet.</p>
          <ul v-else class="series-list">
            <li v-for="m in upcomingMeetings" :key="m.key" class="series">
              <div class="upcoming-row">
                <span class="relative">{{ m.relative }}</span>
                <span class="title" @click="emit('open-meeting', m.id)">
                  {{ m.title }}
                  <span v-if="m.recurring" class="recurring-badge" title="Recurring meeting">↻</span>
                </span>
              </div>

              <div
                v-if="linkedTaskByEventId(m.eventId)"
                class="task-badge"
                @click="emit('open', linkedTaskByEventId(m.eventId)!.id)"
              >
                <span class="status-dot" :class="linkedTaskByEventId(m.eventId)!.status"></span>
                {{ linkedTaskByEventId(m.eventId)!.title }}
              </div>
            </li>
          </ul>
        </section>

        <section class="column">
          <h2>Recurring</h2>
          <p v-if="!recurringSeries.length" class="empty column-empty">No recurring series cached.</p>
          <ul v-else class="series-list">
            <li v-for="sg in recurringSeries" :key="sg.key" class="series">
              <div class="series-row">
                <span class="date">{{ formatDate(sg.latest.start) }}</span>
                <span class="title" @click="emit('open-meeting', sg.latest.id)">{{ sg.latest.title }}</span>
                <span class="occurrence-count" @click="toggleSeries(sg.key)">
                  ×{{ sg.occurrences.length }}
                  <span class="chevron small" :class="{ collapsed: !expandedSeries.has(sg.key) }">▾</span>
                </span>
              </div>

              <div v-if="linkedTask(sg.latest)" class="task-badge" @click="emit('open', linkedTask(sg.latest)!.id)">
                <span class="status-dot" :class="linkedTask(sg.latest)!.status"></span>
                {{ linkedTask(sg.latest)!.title }}
              </div>

              <ul v-if="expandedSeries.has(sg.key)" class="occurrences">
                <li
                  v-for="occ in sg.occurrences.slice(1)"
                  :key="occ.id"
                  class="occurrence"
                  @click="emit('open-meeting', occ.id)"
                >
                  <span class="date">{{ formatDate(occ.start) }}</span>
                  <span class="title">{{ occ.title }}</span>
                </li>
              </ul>
            </li>
          </ul>
        </section>

        <section class="column">
          <h2>History</h2>
          <p v-if="!monthGroups.length" class="empty column-empty">No past meetings cached.</p>
          <template v-else>
            <section v-for="month in monthGroups" :key="month.key" class="month">
              <button class="month-header" @click="toggleMonth(month.key)">
                <span class="chevron" :class="{ collapsed: collapsedMonths.has(month.key) }">▾</span>
                <h3>{{ month.label }}</h3>
                <span class="count">{{ month.meetings.length }}</span>
              </button>

              <ul v-if="!collapsedMonths.has(month.key)" class="series-list">
                <li v-for="m in month.meetings" :key="m.id" class="series">
                  <div class="series-row">
                    <span class="date">{{ formatDate(m.start) }}</span>
                    <span class="title" @click="emit('open-meeting', m.id)">{{ m.title }}</span>
                  </div>

                  <div v-if="linkedTask(m)" class="task-badge" @click="emit('open', linkedTask(m)!.id)">
                    <span class="status-dot" :class="linkedTask(m)!.status"></span>
                    {{ linkedTask(m)!.title }}
                  </div>
                </li>
              </ul>
            </section>
          </template>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.meetings-view { padding: var(--space-4); max-width: 1400px; margin: 0 auto; }
.empty { color: var(--color-ink-soft); text-align: center; margin-top: var(--space-6); }

.columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-5); align-items: start; }
.column { min-width: 0; }
.column h2 {
  font-size: 1rem; font-weight: 600; margin: 0 0 var(--space-3); color: var(--color-ink);
  border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-2);
}
.column-empty { margin-top: 0; text-align: left; font-size: 0.85rem; }

@media (max-width: 960px) {
  .columns { grid-template-columns: 1fr; }
}

.month { margin-bottom: var(--space-5); }
.month-header {
  display: flex; align-items: center; gap: var(--space-2); width: 100%;
  background: none; border: none; padding: var(--space-2) 0; cursor: pointer; text-align: left;
}
.month-header h3 { font-size: 0.9rem; font-weight: 600; margin: 0; color: var(--color-ink); }
.month-header .count {
  font-size: 0.75rem; color: var(--color-ink-soft); background: var(--color-surface);
  border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0.1rem 0.4rem;
}
.chevron { display: inline-block; transition: transform 160ms var(--ease); color: var(--color-ink-soft); }
.chevron.collapsed { transform: rotate(-90deg); }
.chevron.small { font-size: 0.7rem; margin-left: var(--space-1); }

.series-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.series {
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3); box-shadow: var(--shadow-sm);
}
.series-row { display: flex; align-items: baseline; gap: var(--space-3); }
.series-row .date { font-size: 0.75rem; color: var(--color-ink-soft); flex-shrink: 0; width: 3.2rem; }
.upcoming-row { display: flex; flex-direction: column; gap: 0.15rem; }
.upcoming-row .relative { font-size: 0.75rem; font-weight: 600; color: var(--color-accent); }
.upcoming-row .title { font-size: 0.9rem; cursor: pointer; }
.upcoming-row .title:hover { color: var(--color-accent); }
.recurring-badge { font-size: 0.75rem; color: var(--color-ink-soft); margin-left: var(--space-1); }
.series-row .title { flex: 1; font-size: 0.9rem; cursor: pointer; }
.series-row .title:hover { color: var(--color-accent); }
.occurrence-count { font-size: 0.75rem; color: var(--color-accent); cursor: pointer; white-space: nowrap; }

.task-badge {
  margin-top: var(--space-2); display: flex; align-items: center; gap: var(--space-2);
  font-size: 0.8rem; color: var(--color-ink-soft); cursor: pointer; padding: var(--space-1) var(--space-2);
  background: var(--color-bg); border-radius: var(--radius-sm); width: fit-content;
}
.task-badge:hover { color: var(--color-ink); }
.status-dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--color-ink-soft); flex-shrink: 0; }
.status-dot.done { background: #6aab6a; }
.status-dot.open { background: var(--color-accent); }
.status-dot.in-progress { background: #c19a3a; }

.occurrences {
  list-style: none; margin: var(--space-2) 0 0; padding: var(--space-2) 0 0; border-top: 1px dashed var(--color-border);
  display: flex; flex-direction: column; gap: var(--space-1);
}
.occurrence { display: flex; gap: var(--space-3); font-size: 0.8rem; color: var(--color-ink-soft); cursor: pointer; }
.occurrence:hover { color: var(--color-ink); }
.occurrence .date { width: 3.2rem; flex-shrink: 0; }
</style>
