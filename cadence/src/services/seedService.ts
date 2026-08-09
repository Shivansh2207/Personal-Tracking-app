/**
 * Development seed data writer.
 *
 * The fixture itself lives in `demoData.ts` (pure, no Firebase) so tests can
 * use it directly. This module is the only part that writes, and it refuses to
 * run outside a development build so demo records can never end up in a real
 * user's account.
 */

import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';

import type { DateKey, UserSettings } from '@/types/models';
import { DemoData, DEMO_SETTINGS, buildDemoWeek } from './demoData';
import { recomputeDailyStats } from './statsService';
import { db } from './firebase/config';
import {
  activityLogsCol,
  categoriesCol,
  goalsCol,
  habitLogsCol,
  habitsCol,
  studySessionsCol,
  subjectsCol,
  tasksCol,
  topicsCol,
} from './firebase/paths';

export async function seedDemoData(
  uid: string,
  options: { endDate?: DateKey; days?: number; settings?: UserSettings } = {},
): Promise<DemoData> {
  if (!__DEV__) {
    throw new Error('Sample data can only be loaded in a development build.');
  }

  const data = buildDemoWeek(uid, options);
  const writes: { ref: ReturnType<typeof doc>; payload: Record<string, unknown> }[] = [];

  const strip = <T extends { id: string }>(record: T) => {
    const { id: _id, ...rest } = record;
    return rest as Record<string, unknown>;
  };

  data.categories.forEach((c) =>
    writes.push({ ref: doc(categoriesCol(uid), c.id), payload: strip(c) }),
  );
  data.habits.forEach((h) => writes.push({ ref: doc(habitsCol(uid), h.id), payload: strip(h) }));
  data.habitLogs.forEach((l) =>
    writes.push({ ref: doc(habitLogsCol(uid), l.id), payload: strip(l) }),
  );
  data.subjects.forEach((s) => writes.push({ ref: doc(subjectsCol(uid), s.id), payload: strip(s) }));
  data.topics.forEach((t) =>
    writes.push({ ref: doc(topicsCol(uid, t.subjectId), t.id), payload: strip(t) }),
  );
  data.tasks.forEach((t) => writes.push({ ref: doc(tasksCol(uid), t.id), payload: strip(t) }));
  data.sessions.forEach((s) =>
    writes.push({ ref: doc(studySessionsCol(uid), s.id), payload: strip(s) }),
  );
  data.activities.forEach((a) =>
    writes.push({ ref: doc(activityLogsCol(uid), a.id), payload: strip(a) }),
  );
  data.goals.forEach((g) => writes.push({ ref: doc(goalsCol(uid), g.id), payload: strip(g) }));

  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    writes
      .slice(i, i + 400)
      .forEach(({ ref, payload }) =>
        batch.set(ref, { ...payload, createdAt: serverTimestamp() }, { merge: true }),
      );
    await batch.commit();
  }

  // Populate the same derived daily documents the real app maintains after
  // each completion. Without these, the demo dashboard and trend charts would
  // stay empty even though the underlying sample activity exists.
  for (const date of data.dates) {
    await recomputeDailyStats(uid, date, options.settings ?? DEMO_SETTINGS);
  }

  return data;
}

export { buildDemoWeek };
export type { DemoData };
