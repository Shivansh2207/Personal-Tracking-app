import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { ProgressRing } from '@/components/ui/Progress';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow, Metric, MetricSmall, Title } from '@/components/ui/Text';
import {
  calculateSubjectProgress,
  chapterProgress,
  forecastSyllabus,
} from '@/services/analytics/study';
import { toFriendlyError } from '@/services/firebase/errors';
import { fetchRevisions } from '@/services/revisionService';
import {
  countSubjectHistory,
  createChapter,
  deleteSubject,
  fetchChapters,
  fetchSessionsInRange,
  fetchSubject,
} from '@/services/studyService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import { CHAPTER_STATUS_LABELS } from '@/types/models';
import type { Chapter, RevisionItem, StudySession, Subject } from '@/types/models';
import { addDays, formatDuration, formatRelativeDate, todayKey } from '@/utils/date';

export default function SubjectDetail() {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const refreshChapters = useDataStore((s) => s.refreshChapters);

  const [subject, setSubject] = useState<Subject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingChapter, setAddingChapter] = useState(false);
  const [newChapter, setNewChapter] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [history, setHistory] = useState<{ chapters: number; sessions: number; minutes: number } | null>(
    null,
  );

  const today = todayKey();

  const load = useCallback(async () => {
    if (!uid || !params.id) return;
    setLoading(true);
    setError(null);
    try {
      const [s, chapterList, sessionList, revisionList] = await Promise.all([
        fetchSubject(uid, params.id),
        fetchChapters(uid, params.id),
        fetchSessionsInRange(uid, addDays(today, -180), today),
        fetchRevisions(uid),
      ]);
      if (!s) {
        setError('This subject no longer exists.');
      } else {
        setSubject(s);
        setChapters(chapterList);
        setSessions(sessionList.filter((x) => x.subjectId === params.id));
        setRevisions(revisionList.filter((r) => r.subjectId === params.id));
      }
    } catch (e) {
      setError(toFriendlyError(e, 'Could not load the subject').message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, params.id, today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const stats = useMemo(
    () => (subject ? calculateSubjectProgress(subject, chapters, sessions, revisions, today) : null),
    [subject, chapters, sessions, revisions, today],
  );

  const forecast = useMemo(
    () =>
      subject
        ? forecastSyllabus(chapters, subject.examDate ?? subject.targetDate, today)
        : null,
    [subject, chapters, today],
  );

  if (loading && !subject) {
    return (
      <Screen>
        <AppHeader showBack title="Subject" />
        <View style={{ padding: 16, gap: 12 }}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </View>
      </Screen>
    );
  }

  if (error || !subject || !stats) {
    return (
      <Screen>
        <AppHeader showBack title="Subject" />
        <View style={{ padding: 16 }}>
          <ErrorState message={error ?? 'Subject not found.'} onRetry={load} />
        </View>
      </Screen>
    );
  }

  const addChapter = async () => {
    if (!uid || !newChapter.trim()) return;
    try {
      await createChapter(uid, subject.id, newChapter, chapters.length);
      setNewChapter('');
      setAddingChapter(false);
      await load();
      await refreshChapters();
      toast.show('Chapter added.');
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not add the chapter').message, 'error');
    }
  };

  return (
    <Screen>
      <AppHeader
        showBack
        eyebrow="Subject"
        title={subject.name}
        right={
          <IconButton
            icon="trash-2"
            label="Delete subject"
            size={40}
            onPress={async () => {
              if (!uid) return;
              setHistory(await countSubjectHistory(uid, subject.id).catch(() => null));
              setConfirmDelete(true);
            }}
          />
        }
      />

      <ScreenScroll>
        <View style={{ gap: space.xl, paddingTop: space.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.lg,
              padding: space.base,
              backgroundColor: c.surface2,
              borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: c.line,
            }}>
            <ProgressRing value={stats.syllabusProgress} size={96} thickness={7} color={subject.color}>
              <Metric tone="strong">{stats.syllabusProgress}</Metric>
            </ProgressRing>
            <View style={{ flex: 1, gap: 6 }}>
              <View>
                <Eyebrow tone="faint">Chapters</Eyebrow>
                <Title tone="strong">
                  {stats.chaptersCompleted} / {stats.chaptersTotal}
                </Title>
              </View>
              <View>
                <Eyebrow tone="faint">Studied</Eyebrow>
                <Title tone="strong">{formatDuration(stats.minutes, '0m')}</Title>
              </View>
              {subject.examDate ? (
                <Caption tone="faint">Exam {formatRelativeDate(subject.examDate)}</Caption>
              ) : subject.targetDate ? (
                <Caption tone="faint">Finish by {formatRelativeDate(subject.targetDate)}</Caption>
              ) : null}
            </View>
          </View>

          {forecast ? (
            <View
              style={{
                padding: space.base,
                gap: 4,
                borderLeftWidth: 2,
                borderLeftColor: subject.color,
                backgroundColor: c.surface1,
              }}>
              <Eyebrow tone="faint">Pace</Eyebrow>
              <Body>
                {forecast.remainingChapters} chapters left in {forecast.daysRemaining} days —
                about {forecast.requiredPacePerWeek} per week.
              </Body>
              {forecast.currentPacePerWeek !== null ? (
                <Caption tone="faint">
                  You are averaging {forecast.currentPacePerWeek} per week.
                </Caption>
              ) : (
                <Caption tone="faint">
                  Complete a chapter to start measuring your actual pace.
                </Caption>
              )}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              label="Start study"
              icon="play"
              style={{ flex: 1 }}
              onPress={() => router.push(`/focus/setup?subjectId=${subject.id}`)}
            />
            <Button
              label="Add chapter"
              icon="plus"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setAddingChapter(true)}
            />
          </View>

          <View>
            <SectionHeader title="Chapters" meta={`${chapters.length}`} />
            {chapters.length === 0 ? (
              <EmptyState
                icon="list"
                title="No chapters yet"
                message="Break the syllabus into chapters you can actually tick off."
                actionLabel="Add chapter"
                onAction={() => setAddingChapter(true)}
                compact
              />
            ) : (
              <View
                style={{
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                  borderRadius: radius.card,
                  overflow: 'hidden',
                  backgroundColor: c.surface2,
                }}>
                {chapters.map((chapter, index) => {
                  const progress = chapterProgress(chapter);
                  const dueRevision = revisions.find(
                    (r) => r.chapterId === chapter.id && r.status === 'due' && r.dueDateKey <= today,
                  );
                  return (
                    <Pressable
                      key={chapter.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${chapter.name}, ${CHAPTER_STATUS_LABELS[chapter.status]}`}
                      onPress={() =>
                        router.push(`/subject/${subject.id}/chapter/${chapter.id}`)
                      }
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                        backgroundColor: pressed ? c.surface3 : 'transparent',
                        borderTopWidth: index > 0 ? StyleSheet.hairlineWidth * 2 : 0,
                        borderTopColor: c.line,
                      })}>
                      <View style={{ width: 38 }}>
                        <MetricSmall
                          color={chapter.status === 'completed' ? subject.color : undefined}
                          tone={chapter.status === 'completed' ? 'default' : 'meta'}>
                          {progress}
                        </MetricSmall>
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Body numberOfLines={1}>{chapter.name}</Body>
                        <Caption tone="faint">
                          {[
                            CHAPTER_STATUS_LABELS[chapter.status],
                            chapter.totalStudyMinutes
                              ? formatDuration(chapter.totalStudyMinutes)
                              : null,
                            chapter.confidence ? `Confidence ${chapter.confidence}/5` : null,
                            dueRevision ? 'Revision due' : null,
                          ]
                            .filter(Boolean)
                            .join('  ·  ')}
                        </Caption>
                      </View>
                      <View
                        style={{
                          width: 4,
                          height: 28,
                          backgroundColor: withAlpha(
                            subject.color,
                            Math.max(0.15, progress / 100),
                          ),
                        }}
                      />
                      <Icon name="chevron-right" size={15} color={c.text30} />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {sessions.length > 0 ? (
            <View>
              <SectionHeader title="Recent sessions" meta={`${sessions.length}`} />
              <View style={{ gap: space.sm }}>
                {sessions.slice(0, 6).map((session) => (
                  <View
                    key={session.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      padding: space.md,
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: c.line,
                      borderRadius: radius.card,
                    }}>
                    <Icon
                      name={session.timetableSlotId ? 'calendar' : 'clock'}
                      size={14}
                      color={c.text40}
                    />
                    <View style={{ flex: 1 }}>
                      <Body numberOfLines={1}>
                        {chapters.find((ch) => ch.id === session.chapterId)?.name ?? 'Study'}
                      </Body>
                      <Caption tone="faint">{formatRelativeDate(session.dateKey)}</Caption>
                    </View>
                    <MetricSmall tone="strong">
                      {formatDuration(session.actualMinutes)}
                    </MetricSmall>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScreenScroll>

      <BottomSheet
        visible={addingChapter}
        onClose={() => setAddingChapter(false)}
        title="Add chapter"
        eyebrow={subject.name}
        footer={<Button label="Add" full onPress={addChapter} disabled={!newChapter.trim()} />}>
        <View style={{ paddingBottom: space.base }}>
          <TextField
            value={newChapter}
            onChangeText={setNewChapter}
            placeholder="Probability"
            autoFocus
            onSubmitEditing={addChapter}
          />
        </View>
      </BottomSheet>

      <ConfirmationDialog
        visible={confirmDelete}
        title="Delete this subject?"
        message={
          history
            ? `${history.chapters} chapter${history.chapters === 1 ? '' : 's'} will be deleted. ${history.sessions} recorded session${history.sessions === 1 ? '' : 's'} (${formatDuration(history.minutes, '0m')}) stay in your history but are unlinked.`
            : 'Its chapters will be deleted. Recorded study sessions are kept.'
        }
        destructive
        confirmLabel="Delete subject"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!uid) return;
          try {
            await deleteSubject(uid, subject.id);
            await refreshChapters();
            setConfirmDelete(false);
            toast.show('Subject deleted.');
            router.back();
          } catch (e) {
            toast.show(toFriendlyError(e, 'Could not delete').message, 'error');
          }
        }}
      />
    </Screen>
  );
}
