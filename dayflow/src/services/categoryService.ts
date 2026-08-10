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
  writeBatch,
} from 'firebase/firestore';

import type { Category, CategoryKind } from '@/types/models';
import { CACHE_KEYS, readCache, writeCache } from './firebase/cache';
import { db } from './firebase/config';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import { categoriesCol, categoryDoc, routinesCol, tasksCol } from './firebase/paths';

export interface CategorySeed {
  name: string;
  icon: string;
  color: string;
  kind?: CategoryKind;
}

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: 'Study', icon: 'book', color: '#7C5CFF', kind: 'study' },
  { name: 'College', icon: 'award', color: '#9BA4FF', kind: 'study' },
  { name: 'Work', icon: 'briefcase', color: '#41CFFF', kind: 'work' },
  { name: 'Gym', icon: 'activity', color: '#FF7A45', kind: 'fitness' },
  { name: 'Personal', icon: 'heart', color: '#4ADE9B', kind: 'personal' },
  { name: 'Skills', icon: 'zap', color: '#F2E85C', kind: 'general' },
];

function mapCategory(snap: any): Category {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    name: data.name ?? '',
    icon: data.icon ?? 'circle',
    color: data.color ?? '#7C5CFF',
    kind: data.kind ?? 'general',
    order: data.order ?? 0,
    active: data.active !== false,
    createdAt: tsToMillis(data.createdAt, Date.now()),
  };
}

export function subscribeCategories(
  uid: string,
  cb: (items: Category[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    categoriesCol(uid),
    (snap) => {
      const items = snap.docs.map(mapCategory).sort((a, b) => a.order - b.order);
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
  const snap = await getDocs(categoriesCol(uid));
  return snap.docs.map(mapCategory).sort((a, b) => a.order - b.order);
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
    kind: seed.kind ?? 'general',
    order: seed.order ?? Date.now() % 100000,
    active: true,
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
      kind: seed.kind ?? 'general',
      order: index,
      active: true,
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

export interface CategoryUsage {
  routines: number;
  tasks: number;
  total: number;
}

export async function getCategoryUsage(uid: string, id: string): Promise<CategoryUsage> {
  const [routines, tasks] = await Promise.all([
    getDocs(query(routinesCol(uid), where('categoryId', '==', id))),
    getDocs(query(tasksCol(uid), where('categoryId', '==', id))),
  ]);
  return { routines: routines.size, tasks: tasks.size, total: routines.size + tasks.size };
}

export type CategoryDeleteStrategy =
  | { mode: 'deactivate' }
  | { mode: 'reassign'; targetCategoryId: string | null };

/**
 * Deleting a category never silently destroys dependent records — the caller
 * must either deactivate it (history intact) or move its records elsewhere.
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

  const [routines, tasks] = await Promise.all([
    getDocs(query(routinesCol(uid), where('categoryId', '==', id))),
    getDocs(query(tasksCol(uid), where('categoryId', '==', id))),
  ]);
  const refs = [...routines.docs, ...tasks.docs].map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs
      .slice(i, i + 400)
      .forEach((ref) => batch.update(ref, { categoryId: strategy.targetCategoryId }));
    await batch.commit();
  }
  await deleteDoc(categoryDoc(uid, id));
}
