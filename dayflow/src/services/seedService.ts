/**
 * Development seed writer.
 *
 * The fixture itself lives in `demoData.ts` (pure, no Firebase) so tests can
 * use it directly. This module is the only part that writes, and it refuses to
 * run outside a development build, so demo records can never end up in a real
 * user's account.
 */

import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';

import type { DateKey, UserSettings } from '@/types/models';
import { DEMO_SETTINGS, DemoData, buildDemoHistory } from './demoData';
import { db } from './firebase/config';
import {
  categoriesCol,
  chaptersCol,
  coursesCol,
  revisionItemsCol,
  routineLogsCol,
  routinesCol,
  studySessionsCol,
  subjectsCol,
  tasksCol,
  timetableSlotsCol,
} from './firebase/paths';
import { recomputeDailySummary } from './summaryService';

export async function seedDemoData(
  uid: string,
  options: { endDate?: DateKey; days?: number; settings?: UserSettings } = {},
): Promise<DemoData> {
  if (!__DEV__) {
    throw new Error('Sample data can only be loaded in a development build.');
  }

  const data = buildDemoHistory(uid, options);
  const writes: { ref: ReturnType<typeof doc>; payload: Record<string, unknown> }[] = [];

  const strip = <T extends { id: string }>(record: T) => {
    const { id: _id, ...rest } = record;
    return rest as Record<string, unknown>;
  };

  await setDoc(doc(coursesCol(uid), 'course_0'), {
    userId: uid,
    name: 'Semester 3',
    description: null,
    active: true,
    createdAt: serverTimestamp(),
  });

  data.categories.forEach((x) =>
    writes.push({ ref: doc(categoriesCol(uid), x.id), payload: strip(x) }),
  );
  data.routines.forEach((x) =>
    writes.push({ ref: doc(routinesCol(uid), x.id), payload: strip(x) }),
  );
  data.routineLogs.forEach((x) =>
    writes.push({ ref: doc(routineLogsCol(uid), x.id), payload: strip(x) }),
  );
  data.tasks.forEach((x) => writes.push({ ref: doc(tasksCol(uid), x.id), payload: strip(x) }));
  data.subjects.forEach((x) =>
    writes.push({ ref: doc(subjectsCol(uid), x.id), payload: strip(x) }),
  );
  data.chapters.forEach((x) =>
    writes.push({ ref: doc(chaptersCol(uid, x.subjectId), x.id), payload: strip(x) }),
  );
  data.sessions.forEach((x) =>
    writes.push({ ref: doc(studySessionsCol(uid), x.id), payload: strip(x) }),
  );
  data.slots.forEach((x) =>
    writes.push({ ref: doc(timetableSlotsCol(uid), x.id), payload: strip(x) }),
  );
  data.revisions.forEach((x) =>
    writes.push({ ref: doc(revisionItemsCol(uid), x.id), payload: strip(x) }),
  );

  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    writes.slice(i, i + 400).forEach(({ ref, payload }) => batch.set(ref, payload, { merge: true }));
    await batch.commit();
  }

  // Build the same derived daily documents the app maintains after each
  // action; without them the demo dashboard and charts would look empty.
  for (const dateKey of data.dates) {
    await recomputeDailySummary(uid, dateKey, options.settings ?? DEMO_SETTINGS);
  }

  return data;
}

export { buildDemoHistory, DEMO_SETTINGS };
export type { DemoData };
