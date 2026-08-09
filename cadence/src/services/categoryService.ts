import {
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import type { Category } from '@/types/models';
import { CACHE_KEYS, readCache, writeCache } from './firebase/cache';
import { db } from './firebase/config';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import { categoriesCol, categoryDoc, habitsCol, subjectsCol, tasksCol } from './firebase/paths';

export interface CategorySeed {
  name: string;
  icon: string;
  color: string;
  kind?: Category['kind'];
}

/** Offered during onboarding; the user picks which ones to activate. */
export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: 'Study', icon: 'book', color: '#7C5CFF', kind: 'study' },
  { name: 'College', icon: 'school', color: '#9BA4FF' },
  { name: 'Work', icon: 'briefcase', color: '#41CFFF' },
  { name: 'Projects', icon: 'layers', color: '#5EEAD4' },
  { name: 'Gym', icon: 'activity', color: '#FF7A45', kind: 'activity' },
  { name: 'Personal', icon: 'heart', color: '#4ADE9B' },
  { name: 'Skills', icon: 'zap', color: '#F2E85C' },
  { name: 'Finance', icon: 'trending-up', color: '#FFBF47' },
];

export function subscribeCategories(
  uid: string,
  cb: (items: Category[]) => void,
  onError?: (e: unknown) => void,
) {
  const q = query(categoriesCol(uid), orderBy('order', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(mapCategory);
      cb(items);
      writeCache(uid, CACHE_KEYS.categories, items);
    },
    onError,
  );
}

export async function loadCachedCategories(uid: string): Promise<Category[]> {
  return (await readCache<Category[]>(uid, CACHE_KEYS.categories)) ?? [];
}

export async function fetchCategories(uid: string): Promise<Category[]> {
  const snap = await getDocs(query(categoriesCol(uid), orderBy('order', 'asc')));
  return snap.docs.map(mapCategory);
}

export async function createCategory(
  uid: string,
  seed: CategorySeed & { order?: number },
): Promise<Category> {
  const ref = doc(categoriesCol(uid));
  const payload = pruneUndefined({
    userId: uid,
    name: seed.name.trim(),
    icon: seed.icon,
    color: seed.color,
    order: seed.order ?? Date.now() % 100000,
    active: true,
    kind: seed.kind ?? 'general',
    createdAt: serverTimestamp(),
  });
  await setDoc(ref, payload);
  return { ...(payload as any), id: ref.id, createdAt: Date.now() } as Category;
}

export async function createCategories(
  uid: string,
  seeds: CategorySeed[],
): Promise<Category[]> {
  const batch = writeBatch(db);
  const created: Category[] = [];
  seeds.forEach((seed, index) => {
    const ref = doc(categoriesCol(uid));
    const payload = {
      userId: uid,
      name: seed.name.trim(),
      icon: seed.icon,
      color: seed.color,
      order: index,
      active: true,
      kind: seed.kind ?? 'general',
      createdAt: serverTimestamp(),
    };
    batch.set(ref, payload);
    created.push({ ...(payload as any), id: ref.id, createdAt: Date.now() });
  });
  await batch.commit();
  return created;
}

export async function updateCategory(
  uid: string,
  id: string,
  patch: Partial<Omit<Category, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(categoryDoc(uid, id), pruneUndefined(patch));
}

export async function reorderCategories(uid: string, orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => batch.update(categoryDoc(uid, id), { order: index }));
  await batch.commit();
}

export interface CategoryUsage {
  tasks: number;
  habits: number;
  subjects: number;
  total: number;
}

/** Counts everything that would be orphaned by deleting a category. */
export async function getCategoryUsage(uid: string, id: string): Promise<CategoryUsage> {
  const [tasks, habits, subjects] = await Promise.all([
    getDocs(query(tasksCol(uid), where('categoryId', '==', id))),
    getDocs(query(habitsCol(uid), where('categoryId', '==', id))),
    getDocs(query(subjectsCol(uid), where('categoryId', '==', id))),
  ]);
  const total = tasks.size + habits.size + subjects.size;
  return { tasks: tasks.size, habits: habits.size, subjects: subjects.size, total };
}

export type CategoryDeleteStrategy =
  | { mode: 'deactivate' }
  | { mode: 'reassign'; targetCategoryId: string | null };

/**
 * Deleting a category never silently destroys its records: the caller must
 * choose to either deactivate the category (history stays intact) or move the
 * dependent records to another category first.
 */
export async function deleteCategory(
  uid: string,
  id: string,
  strategy: CategoryDeleteStrategy,
): Promise<void> {
  if (strategy.mode === 'deactivate') {
    await updateDoc(categoryDoc(uid, id), { active: false });
    return;
  }

  const target = strategy.targetCategoryId;
  const [tasks, habits, subjects] = await Promise.all([
    getDocs(query(tasksCol(uid), where('categoryId', '==', id))),
    getDocs(query(habitsCol(uid), where('categoryId', '==', id))),
    getDocs(query(subjectsCol(uid), where('categoryId', '==', id))),
  ]);

  // Firestore batches cap at 500 writes.
  const refs = [...tasks.docs, ...habits.docs, ...subjects.docs].map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.update(ref, { categoryId: target }));
    await batch.commit();
  }

  await deleteDoc(categoryDoc(uid, id));
}

function mapCategory(snap: any): Category {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    name: data.name ?? '',
    icon: data.icon ?? 'circle',
    color: data.color ?? '#7C5CFF',
    order: data.order ?? 0,
    active: data.active !== false,
    kind: data.kind ?? 'general',
    createdAt: tsToMillis(data.createdAt, Date.now()),
  };
}
