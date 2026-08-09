/**
 * Data export & account teardown.
 *
 * Users who came from a spreadsheet must be able to leave with their data, so
 * both JSON and CSV exports are produced from the raw records rather than from
 * any derived cache.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDocs, writeBatch } from 'firebase/firestore';

import type { DateKey } from '@/types/models';
import { addDays, todayKey } from '@/utils/date';
import { db } from './firebase/config';
import {
  activityLogsCol,
  categoriesCol,
  dailyReviewsCol,
  dailyStatsCol,
  goalsCol,
  habitLogsCol,
  habitsCol,
  reflectionsCol,
  studySessionsCol,
  subjectsCol,
  tasksCol,
  topicsCol,
  weeklyReviewsCol,
} from './firebase/paths';

export type ExportFormat = 'json' | 'csv';

export interface ExportBundle {
  exportedAt: string;
  app: string;
  version: number;
  categories: any[];
  tasks: any[];
  habits: any[];
  habitLogs: any[];
  subjects: any[];
  topics: any[];
  studySessions: any[];
  activityLogs: any[];
  goals: any[];
  dailyStats: any[];
  dailyReviews: any[];
  weeklyReviews: any[];
  reflections: any[];
}

async function readAll(col: any): Promise<any[]> {
  const snap = await getDocs(col);
  return snap.docs.map((d: any) => ({ id: d.id, ...serialise(d.data()) }));
}

/** Timestamps become ISO strings so the export is readable outside the app. */
function serialise(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialise);
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialise(v);
    return out;
  }
  return value;
}

export async function buildExportBundle(uid: string): Promise<ExportBundle> {
  const subjects = await readAll(subjectsCol(uid));
  const topicLists = await Promise.all(
    subjects.map(async (s) => {
      const rows = await readAll(topicsCol(uid, s.id));
      return rows.map((t) => ({ ...t, subjectId: s.id }));
    }),
  );

  const [
    categories,
    tasks,
    habits,
    habitLogs,
    studySessions,
    activityLogs,
    goals,
    dailyStats,
    dailyReviews,
    weeklyReviews,
    reflections,
  ] = await Promise.all([
    readAll(categoriesCol(uid)),
    readAll(tasksCol(uid)),
    readAll(habitsCol(uid)),
    readAll(habitLogsCol(uid)),
    readAll(studySessionsCol(uid)),
    readAll(activityLogsCol(uid)),
    readAll(goalsCol(uid)),
    readAll(dailyStatsCol(uid)),
    readAll(dailyReviewsCol(uid)),
    readAll(weeklyReviewsCol(uid)),
    readAll(reflectionsCol(uid)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    app: 'DEVBEAST OS',
    version: 1,
    categories,
    tasks,
    habits,
    habitLogs,
    subjects,
    topics: topicLists.flat(),
    studySessions,
    activityLogs,
    goals,
    dailyStats,
    dailyReviews,
    weeklyReviews,
    reflections,
  };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const header = columns.join(',');
  const body = rows.map((row) => columns.map((c) => csvEscape(row[c])).join(',')).join('\n');
  return `${header}\n${body}`;
}

/** CSV export writes one file per collection, bundled as a multi-section text file. */
export function bundleToCsv(bundle: ExportBundle): string {
  const sections: string[] = [];
  const entries: [string, any[]][] = [
    ['categories', bundle.categories],
    ['tasks', bundle.tasks],
    ['habits', bundle.habits],
    ['habitLogs', bundle.habitLogs],
    ['subjects', bundle.subjects],
    ['topics', bundle.topics],
    ['studySessions', bundle.studySessions],
    ['activityLogs', bundle.activityLogs],
    ['goals', bundle.goals],
    ['dailyStats', bundle.dailyStats],
    ['dailyReviews', bundle.dailyReviews],
    ['weeklyReviews', bundle.weeklyReviews],
    ['reflections', bundle.reflections],
  ];
  for (const [name, rows] of entries) {
    if (rows.length === 0) continue;
    sections.push(`## ${name}\n${toCsv(rows)}`);
  }
  return sections.join('\n\n');
}

export interface ExportResult {
  uri: string;
  filename: string;
  shared: boolean;
}

export async function exportUserData(
  uid: string,
  format: ExportFormat,
): Promise<ExportResult> {
  const bundle = await buildExportBundle(uid);
  const content = format === 'json' ? JSON.stringify(bundle, null, 2) : bundleToCsv(bundle);
  const filename = `devbeast-os-export-${todayKey()}.${format}`;

  const file = new FileSystem.File(FileSystem.Paths.cache, filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(content);

  let shared = false;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: format === 'json' ? 'application/json' : 'text/csv',
      dialogTitle: 'Export DEVBEAST OS data',
      UTI: format === 'json' ? 'public.json' : 'public.comma-separated-values-text',
    });
    shared = true;
  }

  return { uri: file.uri, filename, shared };
}

/**
 * Removes every subcollection under `users/{uid}`. Client SDKs cannot delete a
 * document tree in one call, so this walks the known collections explicitly
 * before the account itself is deleted.
 */
export async function deleteAllUserData(uid: string): Promise<void> {
  const subjects = await getDocs(subjectsCol(uid));
  const topicRefs = (
    await Promise.all(
      subjects.docs.map(async (s) => (await getDocs(topicsCol(uid, s.id))).docs.map((d) => d.ref)),
    )
  ).flat();

  const collections = [
    categoriesCol(uid),
    tasksCol(uid),
    habitsCol(uid),
    habitLogsCol(uid),
    studySessionsCol(uid),
    activityLogsCol(uid),
    goalsCol(uid),
    dailyStatsCol(uid),
    dailyReviewsCol(uid),
    weeklyReviewsCol(uid),
    reflectionsCol(uid),
    subjectsCol(uid),
  ];

  const refs = [...topicRefs];
  for (const col of collections) {
    const snap = await getDocs(col);
    refs.push(...snap.docs.map((d) => d.ref));
  }

  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/** Default window used by "export last 6 months". */
export function defaultExportRange(): { from: DateKey; to: DateKey } {
  const today = todayKey();
  return { from: addDays(today, -180), to: today };
}
