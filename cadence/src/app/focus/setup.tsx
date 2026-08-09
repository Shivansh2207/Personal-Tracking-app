import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, SegmentedControl, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { resolveIcon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { Eyebrow } from '@/components/ui/Text';
import { fetchTopics } from '@/services/studyService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { TIMER_PRESETS, useTimerStore } from '@/store/timerStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { Topic } from '@/types/models';

export default function FocusSetup() {
  const { space, c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ taskId?: string; title?: string; subjectId?: string }>();

  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);
  const subjects = useDataStore((s) => s.subjects);
  const start = useTimerStore((s) => s.start);
  const activeSession = useTimerStore((s) => s.session);

  const [mode, setMode] = useState<'countdown' | 'stopwatch'>('countdown');
  const [minutes, setMinutes] = useState<number>(45);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(params.subjectId ?? null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [label, setLabel] = useState(params.title ? decodeURIComponent(params.title) : '');

  const studyCategory = useMemo(
    () => categories.find((cat) => cat.kind === 'study') ?? null,
    [categories],
  );

  useEffect(() => {
    if (!categoryId && studyCategory) setCategoryId(studyCategory.id);
  }, [studyCategory, categoryId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uid || !subjectId) {
        setTopics([]);
        setTopicId(null);
        return;
      }
      const list = await fetchTopics(uid, subjectId).catch(() => [] as Topic[]);
      if (!cancelled) setTopics(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, subjectId]);

  // An existing session takes priority — never silently discard running time.
  useEffect(() => {
    if (activeSession) router.replace('/focus/run');
  }, [activeSession, router]);

  const begin = () => {
    const subject = subjects.find((s) => s.id === subjectId);
    const topic = topics.find((t) => t.id === topicId);
    const resolvedLabel =
      label.trim() ||
      [subject?.name, topic?.name].filter(Boolean).join(' · ') ||
      'Focus session';

    start({
      mode,
      targetMinutes: mode === 'countdown' ? minutes : null,
      subjectId,
      topicId,
      categoryId: categoryId ?? subject?.categoryId ?? null,
      taskId: params.taskId ?? null,
      label: resolvedLabel,
    });
    toast.show('Session started.');
    router.replace('/focus/run');
  };

  return (
    <Screen>
      <AppHeader title="Focus session" eyebrow="Deep work" showBack />
      <ScreenScroll bottomInset={140}>
        <View style={{ gap: space.lg, paddingTop: space.sm }}>
          <View style={{ gap: space.sm }}>
            <Eyebrow tone="meta">Mode</Eyebrow>
            <SegmentedControl
              options={[
                { value: 'countdown', label: 'Timer' },
                { value: 'stopwatch', label: 'Stopwatch' },
              ]}
              value={mode}
              onChange={(v) => setMode(v as 'countdown' | 'stopwatch')}
            />
          </View>

          {mode === 'countdown' ? (
            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Length</Eyebrow>
              <ChipGroup>
                {TIMER_PRESETS.map((preset) => (
                  <Chip
                    key={preset}
                    label={`${preset} min`}
                    selected={minutes === preset}
                    onPress={() => setMinutes(preset)}
                  />
                ))}
              </ChipGroup>
            </View>
          ) : null}

          {categories.filter((cat) => cat.active).length > 0 ? (
            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Category</Eyebrow>
              <ChipGroup>
                {categories
                  .filter((cat) => cat.active)
                  .map((cat) => (
                    <Chip
                      key={cat.id}
                      label={cat.name}
                      icon={resolveIcon(cat.icon)}
                      color={cat.color}
                      selected={categoryId === cat.id}
                      onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)}
                    />
                  ))}
              </ChipGroup>
            </View>
          ) : null}

          {subjects.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Subject</Eyebrow>
              <ChipGroup>
                {subjects.map((subject) => (
                  <Chip
                    key={subject.id}
                    label={subject.name}
                    color={subject.color}
                    selected={subjectId === subject.id}
                    onPress={() => {
                      setSubjectId(subjectId === subject.id ? null : subject.id);
                      setTopicId(null);
                    }}
                  />
                ))}
              </ChipGroup>
            </View>
          ) : null}

          {topics.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Topic</Eyebrow>
              <ChipGroup>
                {topics.map((topic) => (
                  <Chip
                    key={topic.id}
                    label={topic.name}
                    size="sm"
                    selected={topicId === topic.id}
                    onPress={() => setTopicId(topicId === topic.id ? null : topic.id)}
                  />
                ))}
              </ChipGroup>
            </View>
          ) : null}

          <TextField
            label="What are you working on?"
            value={label}
            onChangeText={setLabel}
            placeholder="Probability practice"
          />

          <InlineNote
            icon="clock"
            text="The timer runs from a saved start time, so closing the app — or a crash — will not lose your session."
          />
        </View>
      </ScreenScroll>

      <View
        style={{
          padding: 16,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: c.line,
        }}>
        <Button label="Start focus session" full size="lg" icon="play" onPress={begin} />
      </View>
    </Screen>
  );
}
