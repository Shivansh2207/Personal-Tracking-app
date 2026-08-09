/**
 * Firestore <-> app model conversion.
 *
 * Firestore returns `Timestamp` objects for server timestamps; the app works in
 * plain epoch milliseconds so that everything downstream (scoring, sorting,
 * caching to JSON) stays serialisable.
 */

import {
  DocumentData,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';

export function tsToMillis(value: unknown, fallback = 0): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'seconds' in (value as any)) {
    const v = value as { seconds: number; nanoseconds?: number };
    return v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1e6);
  }
  return fallback;
}

/** Removes `undefined` values — Firestore rejects them. */
export function pruneUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as T;
}

export type Snap = QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>;

/** Reads a snapshot, normalising every timestamp-ish field to millis. */
export function readDoc<T extends { id: string }>(
  snap: Snap,
  timestampFields: string[] = ['createdAt', 'updatedAt', 'completedAt'],
): T | null {
  const data = snap.data();
  if (!data) return null;
  const out: Record<string, unknown> = { ...data, id: snap.id };
  for (const field of timestampFields) {
    if (field in out) {
      out[field] = out[field] === null ? null : tsToMillis(out[field], 0);
    }
  }
  return out as T;
}
