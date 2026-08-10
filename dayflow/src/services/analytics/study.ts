/**
 * Study analytics.
 *
 * Two rules matter most here:
 *   - spontaneous study counts toward *total* study time but never toward
 *     timetable adherence, which only measures scheduled slots;
 *   - time spent never implies syllabus progress. A chapter only advances when
 *     the user says it has.
 */

import type {
  Chapter,
  ChapterStatus,
  DateKey,
  RevisionItem,
  StudySession,
  Subject,
  TimetableSlot,
} from '@/types/models';
import { dayOfWeek, diffDays } from '@/utils/date';

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export function calculateStudyMinutes(sessions: StudySession[]): number {
  return sessions.reduce((a, s) => a + Math.max(0, s.actualMinutes), 0);
}

export interface StudySplit {
  totalMinutes: number;
  plannedMinutes: number;
  extraMinutes: number;
  sessionCount: number;
  averageSessionMinutes: number;
}

/** Splits recorded study into scheduled ("planned") and spontaneous ("extra"). */
export function splitPlannedAndExtra(sessions: StudySession[]): StudySplit {
  const totalMinutes = calculateStudyMinutes(sessions);
  const planned = sessions.filter((s) => !!s.timetableSlotId);
  const plannedMinutes = calculateStudyMinutes(planned);
  return {
    totalMinutes,
    plannedMinutes,
    extraMinutes: totalMinutes - plannedMinutes,
    sessionCount: sessions.length,
    averageSessionMinutes:
      sessions.length > 0 ? Math.round(totalMinutes / sessions.length) : 0,
  };
}

export interface SubjectStudyStats {
  subjectId: string;
  name: string;
  color: string;
  minutes: number;
  sessionCount: number;
  chaptersTotal: number;
  chaptersCompleted: number;
  /** 0–100 syllabus completion. */
  syllabusProgress: number;
  averageConfidence: number | null;
  revisionDue: number;
  weeklyTargetMinutes: number | null;
}

export function calculateSubjectProgress(
  subject: Subject,
  chapters: Chapter[],
  sessions: StudySession[],
  revisions: RevisionItem[] = [],
  today?: DateKey,
): SubjectStudyStats {
  const subjectChapters = chapters.filter((c) => c.subjectId === subject.id);
  const subjectSessions = sessions.filter((s) => s.subjectId === subject.id);
  const rated = subjectChapters.filter((c) => typeof c.confidence === 'number');

  const syllabusProgress =
    subjectChapters.length > 0
      ? Math.round(
          subjectChapters.reduce((a, c) => a + chapterProgress(c), 0) / subjectChapters.length,
        )
      : 0;

  return {
    subjectId: subject.id,
    name: subject.name,
    color: subject.color,
    minutes: calculateStudyMinutes(subjectSessions),
    sessionCount: subjectSessions.length,
    chaptersTotal: subjectChapters.length,
    chaptersCompleted: subjectChapters.filter((c) => c.status === 'completed').length,
    syllabusProgress,
    averageConfidence:
      rated.length > 0
        ? Math.round((rated.reduce((a, c) => a + (c.confidence ?? 0), 0) / rated.length) * 10) / 10
        : null,
    revisionDue: revisions.filter(
      (r) => r.subjectId === subject.id && r.status === 'due' && (!today || r.dueDateKey <= today),
    ).length,
    weeklyTargetMinutes: subject.weeklyTargetMinutes,
  };
}

/** A chapter's contribution to syllabus completion. */
export function chapterProgress(chapter: Chapter): number {
  if (chapter.status === 'completed') return 100;
  if (typeof chapter.progress === 'number' && chapter.progress > 0) {
    return Math.max(0, Math.min(100, chapter.progress));
  }
  switch (chapter.status) {
    case 'revision':
      return 80;
    case 'practice':
      return 60;
    case 'learning':
      return 30;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------

export interface SlotOccurrence {
  slot: TimetableSlot;
  dateKey: DateKey;
}

/** Every timetable occurrence inside a range. */
export function slotOccurrences(
  slots: TimetableSlot[],
  dates: DateKey[],
): SlotOccurrence[] {
  const out: SlotOccurrence[] = [];
  for (const date of dates) {
    const dow = dayOfWeek(date);
    for (const slot of slots) {
      if (!slot.active) continue;
      if (slot.daysOfWeek.includes(dow)) out.push({ slot, dateKey: date });
    }
  }
  return out;
}

export type SlotOutcome = 'completed' | 'partial' | 'missed';

export interface SlotResult extends SlotOccurrence {
  outcome: SlotOutcome;
  actualMinutes: number;
  plannedMinutes: number;
}

/** A slot counts as partially met above this share of its planned length. */
const PARTIAL_THRESHOLD = 0.5;

export function evaluateSlots(
  occurrences: SlotOccurrence[],
  sessions: StudySession[],
  today: DateKey,
): SlotResult[] {
  return occurrences
    .filter((o) => o.dateKey <= today)
    .map((occurrence) => {
      const matched = sessions.filter(
        (s) => s.timetableSlotId === occurrence.slot.id && s.dateKey === occurrence.dateKey,
      );
      const actualMinutes = calculateStudyMinutes(matched);
      const plannedMinutes = occurrence.slot.durationMinutes;
      const ratio = plannedMinutes > 0 ? actualMinutes / plannedMinutes : 0;
      const outcome: SlotOutcome =
        ratio >= 1 ? 'completed' : ratio >= PARTIAL_THRESHOLD ? 'partial' : actualMinutes > 0 ? 'partial' : 'missed';
      return { ...occurrence, outcome, actualMinutes, plannedMinutes };
    });
}

export interface TimetableAdherence {
  /** 0–100, with partial slots earning proportional credit. */
  rate: number;
  scheduled: number;
  completed: number;
  partial: number;
  missed: number;
  plannedMinutes: number;
  actualMinutes: number;
  /** Slot with the worst record, when there is enough evidence to name one. */
  weakestSlot: { slotId: string; label: string; rate: number } | null;
}

export function calculateTimetableAdherence(
  results: SlotResult[],
  labelForSlot?: (slot: TimetableSlot) => string,
): TimetableAdherence {
  if (results.length === 0) {
    return {
      rate: 0,
      scheduled: 0,
      completed: 0,
      partial: 0,
      missed: 0,
      plannedMinutes: 0,
      actualMinutes: 0,
      weakestSlot: null,
    };
  }

  let earned = 0;
  const bySlot = new Map<string, { earned: number; count: number; slot: TimetableSlot }>();

  for (const result of results) {
    const credit =
      result.plannedMinutes > 0
        ? Math.min(1, result.actualMinutes / result.plannedMinutes)
        : result.outcome === 'completed'
          ? 1
          : 0;
    earned += credit;
    const entry = bySlot.get(result.slot.id) ?? { earned: 0, count: 0, slot: result.slot };
    entry.earned += credit;
    entry.count += 1;
    bySlot.set(result.slot.id, entry);
  }

  // Only name a weak slot once it has occurred enough times to mean something.
  const ranked = [...bySlot.values()]
    .filter((e) => e.count >= 2)
    .map((e) => ({
      slotId: e.slot.id,
      label: labelForSlot ? labelForSlot(e.slot) : e.slot.startTime,
      rate: Math.round((e.earned / e.count) * 100),
    }))
    .sort((a, b) => a.rate - b.rate);

  return {
    rate: Math.round((earned / results.length) * 100),
    scheduled: results.length,
    completed: results.filter((r) => r.outcome === 'completed').length,
    partial: results.filter((r) => r.outcome === 'partial').length,
    missed: results.filter((r) => r.outcome === 'missed').length,
    plannedMinutes: results.reduce((a, r) => a + r.plannedMinutes, 0),
    actualMinutes: results.reduce((a, r) => a + r.actualMinutes, 0),
    weakestSlot: ranked[0] && ranked[0].rate < 80 ? ranked[0] : null,
  };
}

// ---------------------------------------------------------------------------
// Chapter selection for "next incomplete" slots
// ---------------------------------------------------------------------------

const INCOMPLETE: ChapterStatus[] = ['not_started', 'learning', 'practice', 'revision'];

/**
 * The chapter a `next_incomplete` slot should suggest: the first chapter in
 * order that is not yet completed. Returns null once the syllabus is done.
 */
export function nextIncompleteChapter(chapters: Chapter[]): Chapter | null {
  const ordered = [...chapters].sort((a, b) => a.order - b.order);
  const inProgress = ordered.find(
    (c) => c.status !== 'completed' && c.status !== 'not_started',
  );
  if (inProgress) return inProgress;
  return ordered.find((c) => INCOMPLETE.includes(c.status)) ?? null;
}

// ---------------------------------------------------------------------------
// Forecasting
// ---------------------------------------------------------------------------

export interface SyllabusForecast {
  remainingChapters: number;
  daysRemaining: number;
  /** Chapters per week needed to finish on time. */
  requiredPacePerWeek: number;
  /** Chapters per week actually achieved so far, or null if unknown. */
  currentPacePerWeek: number | null;
  onTrack: boolean | null;
}

/**
 * A simple projection. Returns null when there is not enough evidence — no
 * target date, nothing left to do, or no completion history to measure a pace
 * from. Guessing is worse than saying nothing.
 */
export function forecastSyllabus(
  chapters: Chapter[],
  targetDate: DateKey | null,
  today: DateKey,
  historyWindowDays = 28,
): SyllabusForecast | null {
  if (!targetDate) return null;
  const remaining = chapters.filter((c) => c.status !== 'completed').length;
  if (remaining === 0) return null;

  const daysRemaining = diffDays(today, targetDate);
  if (daysRemaining <= 0) return null;

  const requiredPacePerWeek = Math.round((remaining / (daysRemaining / 7)) * 10) / 10;

  const recentlyCompleted = chapters.filter(
    (c) =>
      c.status === 'completed' &&
      c.completedAt &&
      diffDays(new Date(c.completedAt).toISOString().slice(0, 10), today) <= historyWindowDays,
  ).length;

  const currentPacePerWeek =
    recentlyCompleted > 0
      ? Math.round((recentlyCompleted / (historyWindowDays / 7)) * 10) / 10
      : null;

  return {
    remainingChapters: remaining,
    daysRemaining,
    requiredPacePerWeek,
    currentPacePerWeek,
    onTrack: currentPacePerWeek === null ? null : currentPacePerWeek >= requiredPacePerWeek,
  };
}

// ---------------------------------------------------------------------------
// Revision
// ---------------------------------------------------------------------------

export interface RevisionStats {
  dueToday: number;
  overdue: number;
  upcoming: number;
  completed: number;
  /** 0–100 of items whose due date has passed and were actually revised. */
  completionRate: number | null;
}

export function calculateRevisionCompletion(
  items: RevisionItem[],
  today: DateKey,
): RevisionStats {
  const due = items.filter((r) => r.status === 'due');
  const settled = items.filter((r) => r.dueDateKey <= today && r.status !== 'due');
  const completed = items.filter((r) => r.status === 'completed').length;
  const expected = settled.length + due.filter((r) => r.dueDateKey <= today).length;

  return {
    dueToday: due.filter((r) => r.dueDateKey === today).length,
    overdue: due.filter((r) => r.dueDateKey < today).length,
    upcoming: due.filter((r) => r.dueDateKey > today).length,
    completed,
    completionRate:
      expected > 0
        ? Math.round((items.filter((r) => r.status === 'completed' && r.dueDateKey <= today).length / expected) * 100)
        : null,
  };
}

/** Default spaced-repetition offsets, in days. */
export const REVISION_OFFSETS = [1, 3, 7, 14, 30] as const;

export function nextRevisionOffset(revisionNumber: number): number {
  return REVISION_OFFSETS[Math.min(revisionNumber, REVISION_OFFSETS.length - 1)] ?? 30;
}
