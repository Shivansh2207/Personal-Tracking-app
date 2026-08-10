import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TextField } from '@/components/ui/Controls';
import { Icon, IconName } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { EmptyState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow } from '@/components/ui/Text';
import { fetchSessionsInRange } from '@/services/studyService';
import { fetchTasksInRange } from '@/services/taskService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { StudySession, Task } from '@/types/models';
import { addDays, formatDuration, formatRelativeDate, todayKey } from '@/utils/date';

type Kind = 'subject' | 'chapter' | 'routine' | 'task' | 'session';

const KIND_ICONS: Record<Kind, IconName> = {
  subject: 'book',
  chapter: 'list',
  routine: 'repeat',
  task: 'check-square',
  session: 'clock',
};

const KIND_LABELS: Record<Kind, string> = {
  subject: 'Subjects',
  chapter: 'Chapters',
  routine: 'Routines',
  task: 'Tasks',
  session: 'Study sessions',
};

interface Result {
  id: string;
  kind: Kind;
  title: string;
  subtitle: string;
  href: string;
  score: number;
}

function match(haystack: string | null | undefined, needle: string): number {
  if (!haystack) return 0;
  const index = haystack.toLowerCase().indexOf(needle);
  if (index === -1) return 0;
  return index === 0 ? 100 : 60 - Math.min(40, index);
}

export default function Search() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { subjects, chapters, routines, backlog, recurringTemplates } = useDataStore();

  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    const today = todayKey();
    try {
      const [taskList, sessionList] = await Promise.all([
        fetchTasksInRange(uid, addDays(today, -180), addDays(today, 120)),
        fetchSessionsInRange(uid, addDays(today, -180), today),
      ]);
      setTasks([...taskList, ...backlog, ...recurringTemplates]);
      setSessions(sessionList);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, backlog.length, recurringTemplates.length]);

  useEffect(() => {
    load();
  }, [load]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [] as Result[];

    const out: Result[] = [];
    const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

    for (const subject of subjects) {
      const score = match(subject.name, q);
      if (score) {
        out.push({
          id: subject.id,
          kind: 'subject',
          title: subject.name,
          subtitle: 'Subject',
          href: `/subject/${subject.id}`,
          score,
        });
      }
    }

    for (const chapter of chapters) {
      const score = match(chapter.name, q);
      if (score) {
        out.push({
          id: chapter.id,
          kind: 'chapter',
          title: chapter.name,
          subtitle: `${subjectName.get(chapter.subjectId) ?? 'Subject'} · ${formatDuration(chapter.totalStudyMinutes, '0m')} studied`,
          href: `/subject/${chapter.subjectId}/chapter/${chapter.id}`,
          score,
        });
      }
    }

    for (const routine of routines) {
      const score = match(routine.name, q);
      if (score) {
        out.push({
          id: routine.id,
          kind: 'routine',
          title: routine.name,
          subtitle: routine.active ? 'Active routine' : 'Archived routine',
          href: `/routine/${routine.id}`,
          score,
        });
      }
    }

    const seenTasks = new Set<string>();
    for (const task of tasks) {
      if (seenTasks.has(task.id)) continue;
      seenTasks.add(task.id);
      const score = Math.max(match(task.title, q), match(task.notes, q) * 0.5);
      if (score) {
        out.push({
          id: task.id,
          kind: 'task',
          title: task.title,
          subtitle: task.isRecurringTemplate
            ? 'Repeating task'
            : task.dateKey
              ? `${formatRelativeDate(task.dateKey)}${task.status === 'completed' ? ' · done' : ''}`
              : 'Backlog',
          href: `/task/${encodeURIComponent(task.id)}`,
          score,
        });
      }
    }

    for (const session of sessions) {
      const chapterName = chapters.find((ch) => ch.id === session.chapterId)?.name;
      const label = chapterName ?? subjectName.get(session.subjectId ?? '') ?? 'Study session';
      const score = Math.max(match(label, q), match(session.notes, q) * 0.5);
      if (score) {
        out.push({
          id: session.id,
          kind: 'session',
          title: label,
          subtitle: `${formatRelativeDate(session.dateKey)} · ${formatDuration(session.actualMinutes)}`,
          href: `/history/${session.dateKey}`,
          score,
        });
      }
    }

    return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 40);
  }, [query, subjects, chapters, routines, tasks, sessions]);

  const grouped = useMemo(() => {
    const map = new Map<Kind, Result[]>();
    for (const result of results) {
      const list = map.get(result.kind) ?? [];
      list.push(result);
      map.set(result.kind, list);
    }
    return [...map.entries()];
  }, [results]);

  return (
    <Screen>
      <AppHeader title="Search" showBack bordered={false} />
      <View style={{ paddingHorizontal: 16, paddingBottom: space.md }}>
        <TextField
          icon="search"
          value={query}
          onChangeText={setQuery}
          placeholder="Probability, gym, assignment…"
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <ScreenScroll>
        {loading ? (
          <SkeletonCard lines={3} />
        ) : query.trim().length < 2 ? (
          <EmptyState
            icon="search"
            title="Search everything"
            message="Subjects, chapters, routines, tasks and study history from the last six months."
            compact
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon="search"
            title="No matches"
            message={`Nothing found for "${query.trim()}".`}
            compact
          />
        ) : (
          <View style={{ gap: space.lg }}>
            {grouped.map(([kind, items]) => (
              <View key={kind}>
                <Eyebrow tone="faint" style={{ paddingBottom: space.sm }}>
                  {KIND_LABELS[kind]} · {items.length}
                </Eyebrow>
                <View
                  style={{
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                    borderRadius: radius.card,
                    overflow: 'hidden',
                    backgroundColor: c.surface2,
                  }}>
                  {items.map((result, index) => (
                    <Pressable
                      key={`${result.kind}-${result.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${KIND_LABELS[result.kind]}: ${result.title}`}
                      onPress={() => router.push(result.href as never)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                        backgroundColor: pressed ? c.surface3 : 'transparent',
                        borderTopWidth: index > 0 ? StyleSheet.hairlineWidth * 2 : 0,
                        borderTopColor: c.line,
                      })}>
                      <Icon name={KIND_ICONS[result.kind]} size={15} color={accent.base} />
                      <View style={{ flex: 1 }}>
                        <Body numberOfLines={1}>{result.title}</Body>
                        <Caption tone="faint">{result.subtitle}</Caption>
                      </View>
                      <Icon name="chevron-right" size={15} color={c.text30} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}
