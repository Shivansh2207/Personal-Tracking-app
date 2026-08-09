import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TextField } from '@/components/ui/Controls';
import { Icon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { EmptyState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow } from '@/components/ui/Text';
import { fetchReflections } from '@/services/reviewService';
import {
  SearchCorpus,
  SearchKind,
  labelForKind,
  searchAll,
  searchWindow,
} from '@/services/searchService';
import { fetchAllTopics, fetchSessionsInRange } from '@/services/studyService';
import { fetchTasksInRange } from '@/services/taskService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';

const KIND_ICONS: Record<SearchKind, React.ComponentProps<typeof Icon>['name']> = {
  task: 'check-square',
  habit: 'repeat',
  subject: 'book',
  topic: 'list',
  goal: 'target',
  session: 'clock',
  note: 'edit-3',
};

export default function Search() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const habits = useDataStore((s) => s.habits);
  const goals = useDataStore((s) => s.goals);
  const subjects = useDataStore((s) => s.subjects);
  const backlog = useDataStore((s) => s.backlog);
  const templates = useDataStore((s) => s.recurringTemplates);

  const [query, setQuery] = useState('');
  const [corpus, setCorpus] = useState<SearchCorpus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    const { from, to } = searchWindow();
    try {
      const [tasks, sessions, topics, reflections] = await Promise.all([
        fetchTasksInRange(uid, from, to),
        fetchSessionsInRange(uid, from, to),
        fetchAllTopics(uid, subjects),
        fetchReflections(uid, from, to),
      ]);
      setCorpus({
        tasks: [...tasks, ...backlog, ...templates],
        habits,
        subjects,
        topics,
        goals,
        sessions,
        reflections,
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, subjects.length, habits.length, goals.length, backlog.length, templates.length]);

  useEffect(() => {
    load();
  }, [load]);

  const results = useMemo(
    () => (corpus ? searchAll(corpus, query) : []),
    [corpus, query],
  );

  const grouped = useMemo(() => {
    const map = new Map<SearchKind, typeof results>();
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
          placeholder="Probability, gym, portfolio…"
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
            message="Tasks, habits, subjects, topics, goals, focus sessions and notes across the last six months."
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
                  {labelForKind(kind)} · {items.length}
                </Eyebrow>
                <View
                  style={{
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                    borderRadius: radius.card,
                    overflow: 'hidden',
                    backgroundColor: c.surface2,
                  }}>
                  {items.map((result, i) => (
                    <Pressable
                      key={result.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${labelForKind(result.kind)}: ${result.title}`}
                      onPress={() => router.push(result.href as never)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                        backgroundColor: pressed ? c.surface3 : 'transparent',
                        borderTopWidth: i > 0 ? StyleSheet.hairlineWidth * 2 : 0,
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
