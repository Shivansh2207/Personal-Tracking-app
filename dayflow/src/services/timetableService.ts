import {
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { nextIncompleteChapter } from '@/services/analytics/study';
import type {
  Chapter,
  ChapterMode,
  DateKey,
  StudySession,
  Subject,
  TimeString,
  TimetableSlot,
} from '@/types/models';
import { dayOfWeek, timeToMinutes } from '@/utils/date';
import { CACHE_KEYS, readCache, writeCache } from './firebase/cache';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import { timetableSlotDoc, timetableSlotsCol } from './firebase/paths';

export function mapSlot(snap: any): TimetableSlot {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    subjectId: data.subjectId,
    chapterMode: data.chapterMode ?? 'next_incomplete',
    fixedChapterId: data.fixedChapterId ?? null,
    daysOfWeek: Array.isArray(data.daysOfWeek) ? data.daysOfWeek : [],
    startTime: data.startTime ?? '19:00',
    durationMinutes: data.durationMinutes ?? 60,
    reminderOffsetMinutes: data.reminderOffsetMinutes ?? null,
    notificationId: data.notificationId ?? null,
    active: data.active !== false,
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
  };
}

export function subscribeTimetable(
  uid: string,
  cb: (slots: TimetableSlot[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    timetableSlotsCol(uid),
    (snap) => {
      const slots = snap.docs.map(mapSlot).sort(compareSlots);
      cb(slots);
      writeCache(uid, CACHE_KEYS.timetable, slots);
    },
    onError,
  );
}

export async function loadCachedTimetable(uid: string): Promise<TimetableSlot[]> {
  return (await readCache<TimetableSlot[]>(uid, CACHE_KEYS.timetable)) ?? [];
}

export async function fetchTimetable(uid: string): Promise<TimetableSlot[]> {
  const snap = await getDocs(timetableSlotsCol(uid));
  return snap.docs.map(mapSlot).sort(compareSlots);
}

function compareSlots(a: TimetableSlot, b: TimetableSlot): number {
  const aDay = Math.min(...(a.daysOfWeek.length ? a.daysOfWeek : [7]));
  const bDay = Math.min(...(b.daysOfWeek.length ? b.daysOfWeek : [7]));
  if (aDay !== bDay) return aDay - bDay;
  return (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0);
}

export interface SlotDraft {
  subjectId: string;
  daysOfWeek: number[];
  startTime: TimeString;
  durationMinutes: number;
  chapterMode?: ChapterMode;
  fixedChapterId?: string | null;
  reminderOffsetMinutes?: number | null;
}

export async function createSlot(uid: string, draft: SlotDraft): Promise<TimetableSlot> {
  const ref = doc(timetableSlotsCol(uid));
  const payload = pruneUndefined({
    userId: uid,
    subjectId: draft.subjectId,
    chapterMode: draft.chapterMode ?? 'next_incomplete',
    fixedChapterId: draft.chapterMode === 'fixed' ? (draft.fixedChapterId ?? null) : null,
    daysOfWeek: [...draft.daysOfWeek].sort((a, b) => a - b),
    startTime: draft.startTime,
    durationMinutes: Math.max(5, Math.round(draft.durationMinutes)),
    reminderOffsetMinutes: draft.reminderOffsetMinutes ?? null,
    notificationId: null,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(ref, payload);
  const now = Date.now();
  return { ...(payload as any), id: ref.id, createdAt: now, updatedAt: now } as TimetableSlot;
}

export async function updateSlot(
  uid: string,
  id: string,
  patch: Partial<Omit<TimetableSlot, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(
    timetableSlotDoc(uid, id),
    pruneUndefined({ ...patch, updatedAt: serverTimestamp() }),
  );
}

export async function deleteSlot(uid: string, id: string): Promise<void> {
  await deleteDoc(timetableSlotDoc(uid, id));
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface ResolvedSlot {
  slot: TimetableSlot;
  dateKey: DateKey;
  subject: Subject | null;
  /** The chapter this occurrence should cover, resolved from the slot's mode. */
  chapter: Chapter | null;
  startMinutes: number;
  endMinutes: number;
  /** Minutes already recorded against this occurrence. */
  actualMinutes: number;
  status: 'upcoming' | 'now' | 'completed' | 'partial' | 'missed';
}

/**
 * Resolves a day's timetable into concrete, startable sessions.
 *
 * `next_incomplete` slots pick the first chapter that is not yet complete —
 * they never mark anything complete themselves; the user confirms progress.
 */
export function resolveSlotsForDate(
  slots: TimetableSlot[],
  dateKey: DateKey,
  subjects: Subject[],
  chapters: Chapter[],
  sessions: StudySession[],
  nowMinutes: number | null,
): ResolvedSlot[] {
  const dow = dayOfWeek(dateKey);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  return slots
    .filter((slot) => slot.active && slot.daysOfWeek.includes(dow))
    .map((slot) => {
      const subjectChapters = chapters.filter((c) => c.subjectId === slot.subjectId);
      const chapter =
        slot.chapterMode === 'fixed'
          ? (subjectChapters.find((c) => c.id === slot.fixedChapterId) ?? null)
          : nextIncompleteChapter(subjectChapters);

      const start = timeToMinutes(slot.startTime) ?? 0;
      const end = start + slot.durationMinutes;
      const matched = sessions.filter(
        (s) => s.timetableSlotId === slot.id && s.dateKey === dateKey,
      );
      const actualMinutes = matched.reduce((a, s) => a + s.actualMinutes, 0);

      let status: ResolvedSlot['status'];
      if (actualMinutes >= slot.durationMinutes) status = 'completed';
      else if (actualMinutes > 0) status = 'partial';
      else if (nowMinutes === null) status = 'upcoming';
      else if (nowMinutes >= start && nowMinutes < end) status = 'now';
      else if (nowMinutes >= end) status = 'missed';
      else status = 'upcoming';

      return {
        slot,
        dateKey,
        subject: subjectById.get(slot.subjectId) ?? null,
        chapter,
        startMinutes: start,
        endMinutes: end,
        actualMinutes,
        status,
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeSlotDays(slot: TimetableSlot): string {
  if (slot.daysOfWeek.length === 0) return 'No days';
  if (slot.daysOfWeek.length === 7) return 'Every day';
  return [...slot.daysOfWeek].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(' · ');
}

export function slotLabel(slot: TimetableSlot, subjects: Subject[]): string {
  const subject = subjects.find((s) => s.id === slot.subjectId);
  return `${subject?.name ?? 'Subject'} · ${describeSlotDays(slot)} ${slot.startTime}`;
}
