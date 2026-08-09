/**
 * Global search.
 *
 * Firestore has no substring index, so search runs client-side over the
 * already-loaded collections plus a bounded fetch of recent tasks and sessions.
 * That keeps it instant and free, and the data volumes involved are small.
 */

import type {
  Goal,
  Habit,
  Reflection,
  StudySession,
  Subject,
  Task,
  Topic,
} from '@/types/models';
import { addDays, formatDuration, formatRelativeDate, todayKey } from '@/utils/date';

export type SearchKind = 'task' | 'habit' | 'subject' | 'topic' | 'goal' | 'session' | 'note';

export interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  href: string;
  score: number;
}

const KIND_LABELS: Record<SearchKind, string> = {
  task: 'Task',
  habit: 'Habit',
  subject: 'Subject',
  topic: 'Topic',
  goal: 'Goal',
  session: 'Session',
  note: 'Note',
};

export function labelForKind(kind: SearchKind): string {
  return KIND_LABELS[kind];
}

function match(haystack: string | null | undefined, needle: string): number {
  if (!haystack) return 0;
  const h = haystack.toLowerCase();
  const idx = h.indexOf(needle);
  if (idx === -1) return 0;
  // Prefix matches rank above mid-word matches.
  return idx === 0 ? 100 : 60 - Math.min(40, idx);
}

export interface SearchCorpus {
  tasks: Task[];
  habits: Habit[];
  subjects: Subject[];
  topics: Topic[];
  goals: Goal[];
  sessions: StudySession[];
  reflections: Reflection[];
}

export function searchAll(corpus: SearchCorpus, rawQuery: string): SearchResult[] {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) return [];

  const results: SearchResult[] = [];
  const subjectName = new Map(corpus.subjects.map((s) => [s.id, s.name]));

  for (const task of corpus.tasks) {
    const score = Math.max(match(task.title, q), match(task.notes, q) * 0.5);
    if (!score) continue;
    results.push({
      id: task.id,
      kind: 'task',
      title: task.title,
      subtitle: task.scheduledDate
        ? `${formatRelativeDate(task.scheduledDate)}${task.status === 'completed' ? ' · Completed' : ''}`
        : 'Backlog',
      href: `/task/${task.id}`,
      score,
    });
  }

  for (const habit of corpus.habits) {
    const score = match(habit.name, q);
    if (!score) continue;
    results.push({
      id: habit.id,
      kind: 'habit',
      title: habit.name,
      subtitle: habit.active ? 'Active habit' : 'Archived habit',
      href: `/habit/${habit.id}`,
      score,
    });
  }

  for (const subject of corpus.subjects) {
    const score = match(subject.name, q);
    if (!score) continue;
    results.push({
      id: subject.id,
      kind: 'subject',
      title: subject.name,
      subtitle: 'Subject',
      href: `/subject/${subject.id}`,
      score,
    });
  }

  for (const topic of corpus.topics) {
    const score = match(topic.name, q);
    if (!score) continue;
    results.push({
      id: topic.id,
      kind: 'topic',
      title: topic.name,
      subtitle: `${subjectName.get(topic.subjectId) ?? 'Subject'} · ${formatDuration(topic.actualMinutes, '0m')} studied`,
      href: `/subject/${topic.subjectId}/topic/${topic.id}`,
      score,
    });
  }

  for (const goal of corpus.goals) {
    const score = Math.max(match(goal.title, q), match(goal.description, q) * 0.5);
    if (!score) continue;
    results.push({
      id: goal.id,
      kind: 'goal',
      title: goal.title,
      subtitle: `${goal.progress}% complete`,
      href: `/goal/${goal.id}`,
      score,
    });
  }

  for (const session of corpus.sessions) {
    const label = session.label ?? subjectName.get(session.subjectId ?? '') ?? 'Focus session';
    const score = Math.max(match(label, q), match(session.notes, q) * 0.5);
    if (!score) continue;
    results.push({
      id: session.id,
      kind: 'session',
      title: label,
      subtitle: `${formatRelativeDate(session.date)} · ${formatDuration(session.durationMinutes)}`,
      href: `/history/${session.date}`,
      score,
    });
  }

  for (const note of corpus.reflections) {
    const score = match(note.text, q);
    if (!score) continue;
    results.push({
      id: note.id,
      kind: 'note',
      title: note.text.length > 60 ? `${note.text.slice(0, 60)}…` : note.text,
      subtitle: formatRelativeDate(note.date),
      href: `/history/${note.date}`,
      score,
    });
  }

  return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 40);
}

/** Window of history that global search reads from. */
export function searchWindow(): { from: string; to: string } {
  const today = todayKey();
  return { from: addDays(today, -180), to: addDays(today, 120) };
}
