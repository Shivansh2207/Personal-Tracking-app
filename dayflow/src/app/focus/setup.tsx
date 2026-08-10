import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, SegmentedControl } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { Caption, Eyebrow } from '@/components/ui/Text';
import { nextIncompleteChapter } from '@/services/analytics/study';
import { fetchChapters } from '@/services/studyService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { TIMER_PRESETS, useTimerStore } from '@/store/timerStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { Chapter, SessionSource } from '@/types/models';

export default function FocusSetup() {
  const { c, space } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{
    subjectId?: string;
    chapterId?: string;
    slotId?: string;
    minutes?: string;
    routineId?: string;
    source?: string;
  }>();

  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const subjects = useDataStore((s) => s.subjects);
  const routines = useDataStore((s) => s.routines);
  const start = useTimerStore((s) => s.start);
  const activeSession = useTimerStore((s) => s.session);

  const [mode, setMode] = useState<'countdown' | 'stopwatch'>('countdown');
  const [minutes, setMinutes] = useState<number>(
    Number(params.minutes) || settings.defaultStudyMinutes,
  );
  const [subjectId, setSubjectId] = useState<string | null>(params.subjectId ?? null);
  const [chapterId, setChapterId] = useState<string | null>(params.chapterId ?? null);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const routine = params.routineId ? routines.find((r) => r.id === params.routineId) : undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uid || !subjectId) {
        setChapters([]);
        return;
      }
      const list = await fetchChapters(uid, subjectId).catch(() => [] as Chapter[]);
      if (cancelled) return;
      setChapters(list);
      if (!params.chapterId) {
        const suggestion = nextIncompleteChapter(list);
        setChapterId(suggestion?.id ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, subjectId]);

  // A running session always wins — never silently discard recorded time.
  useEffect(() => {
    if (activeSession) router.replace('/focus/run');
  }, [activeSession, router]);

  const begin = () => {
    const subject = subjects.find((s) => s.id === subjectId);
    const chapter = chapters.find((ch) => ch.id === chapterId);
    const source: SessionSource = params.slotId
      ? 'timetable'
      : params.source === 'revision'
        ? 'revision'
        : 'timer';

    start({
      plannedMinutes: mode === 'countdown' ? minutes : null,
      subjectId: subjectId ?? null,
      subjectName: subject?.name ?? routine?.name ?? null,
      chapterId: chapterId ?? null,
      chapterName: chapter?.name ?? null,
      topicIds: [],
      timetableSlotId: params.slotId ?? null,
      source,
    });
    toast.show('Session started.');
    router.replace('/focus/run');
  };

  return (
    <Screen>
      <AppHeader title="Focus session" eyebrow="Study" showBack />
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
                {[...new Set([...TIMER_PRESETS, minutes])]
                  .sort((a, b) => a - b)
                  .map((preset) => (
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
                      setChapterId(null);
                    }}
                  />
                ))}
              </ChipGroup>
            </View>
          ) : null}

          {chapters.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Chapter</Eyebrow>
              <ChipGroup>
                {chapters.map((chapter) => (
                  <Chip
                    key={chapter.id}
                    label={chapter.name}
                    size="sm"
                    selected={chapterId === chapter.id}
                    onPress={() => setChapterId(chapterId === chapter.id ? null : chapter.id)}
                  />
                ))}
              </ChipGroup>
              {params.slotId ? (
                <Caption tone="faint">
                  Suggested from your timetable. Change it if you are working on something else.
                </Caption>
              ) : null}
            </View>
          ) : null}

          <InlineNote
            icon="clock"
            text="The timer runs from a saved start time. Closing the app, locking the phone or a crash will not lose the session."
          />
        </View>
      </ScreenScroll>

      <View
        style={{
          padding: 16,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: c.line,
        }}>
        <Button label="Start session" full size="lg" icon="play" onPress={begin} />
      </View>
    </Screen>
  );
}
