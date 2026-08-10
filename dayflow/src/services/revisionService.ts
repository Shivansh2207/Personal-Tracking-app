import {
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { nextRevisionOffset } from '@/services/analytics/study';
import type { Chapter, DateKey, RevisionItem, RevisionStatus } from '@/types/models';
import { addDays, todayKey } from '@/utils/date';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import { revisionItemDoc, revisionItemsCol } from './firebase/paths';

export function mapRevision(snap: any): RevisionItem {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    subjectId: data.subjectId,
    chapterId: data.chapterId,
    topicId: data.topicId ?? null,
    dueDateKey: data.dueDateKey,
    status: data.status ?? 'due',
    revisionNumber: data.revisionNumber ?? 1,
    completedAt: data.completedAt ? tsToMillis(data.completedAt) : null,
    nextRevisionDateKey: data.nextRevisionDateKey ?? null,
    createdAt: tsToMillis(data.createdAt, Date.now()),
  };
}

export function subscribeDueRevisions(
  uid: string,
  cb: (items: RevisionItem[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    query(revisionItemsCol(uid), where('status', '==', 'due')),
    (snap) =>
      cb(snap.docs.map(mapRevision).sort((a, b) => (a.dueDateKey < b.dueDateKey ? -1 : 1))),
    onError,
  );
}

export async function fetchRevisions(uid: string): Promise<RevisionItem[]> {
  const snap = await getDocs(revisionItemsCol(uid));
  return snap.docs.map(mapRevision).sort((a, b) => (a.dueDateKey < b.dueDateKey ? -1 : 1));
}

export async function fetchRevisionsForChapter(
  uid: string,
  chapterId: string,
): Promise<RevisionItem[]> {
  const snap = await getDocs(query(revisionItemsCol(uid), where('chapterId', '==', chapterId)));
  return snap.docs.map(mapRevision);
}

export interface ScheduleRevisionParams {
  subjectId: string;
  chapterId: string;
  topicId?: string | null;
  dueDateKey: DateKey;
  revisionNumber?: number;
}

export async function scheduleRevision(
  uid: string,
  params: ScheduleRevisionParams,
): Promise<RevisionItem> {
  const ref = doc(revisionItemsCol(uid));
  const payload = pruneUndefined({
    userId: uid,
    subjectId: params.subjectId,
    chapterId: params.chapterId,
    topicId: params.topicId ?? null,
    dueDateKey: params.dueDateKey,
    status: 'due' as RevisionStatus,
    revisionNumber: params.revisionNumber ?? 1,
    completedAt: null,
    nextRevisionDateKey: null,
    createdAt: serverTimestamp(),
  });
  await setDoc(ref, payload);
  return { ...(payload as any), id: ref.id, createdAt: Date.now() } as RevisionItem;
}

/** Convenience: schedule the first revision for a chapter N days out. */
export async function scheduleRevisionForChapter(
  uid: string,
  chapter: Chapter,
  offsetDays: number,
): Promise<RevisionItem> {
  return scheduleRevision(uid, {
    subjectId: chapter.subjectId,
    chapterId: chapter.id,
    dueDateKey: addDays(todayKey(), offsetDays),
    revisionNumber: 1,
  });
}

/**
 * Marks a revision done. When `scheduleNext` is set, the following revision is
 * created using the standard spaced-repetition ladder.
 */
export async function completeRevision(
  uid: string,
  item: RevisionItem,
  scheduleNext = true,
): Promise<RevisionItem | null> {
  let next: RevisionItem | null = null;
  let nextDate: DateKey | null = null;

  if (scheduleNext) {
    nextDate = addDays(todayKey(), nextRevisionOffset(item.revisionNumber));
    next = await scheduleRevision(uid, {
      subjectId: item.subjectId,
      chapterId: item.chapterId,
      topicId: item.topicId,
      dueDateKey: nextDate,
      revisionNumber: item.revisionNumber + 1,
    });
  }

  await updateDoc(revisionItemDoc(uid, item.id), {
    status: 'completed' as RevisionStatus,
    completedAt: serverTimestamp(),
    nextRevisionDateKey: nextDate,
  });

  return next;
}

export async function rescheduleRevision(
  uid: string,
  id: string,
  dueDateKey: DateKey,
): Promise<void> {
  await updateDoc(revisionItemDoc(uid, id), { dueDateKey });
}

export async function skipRevision(uid: string, id: string): Promise<void> {
  await updateDoc(revisionItemDoc(uid, id), {
    status: 'skipped' as RevisionStatus,
    completedAt: serverTimestamp(),
  });
}

export async function deleteRevision(uid: string, id: string): Promise<void> {
  await deleteDoc(revisionItemDoc(uid, id));
}
