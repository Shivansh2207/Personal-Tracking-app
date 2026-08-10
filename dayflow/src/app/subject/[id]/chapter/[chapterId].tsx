import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup, RatingPicker, TextField } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { ProgressBar } from '@/components/ui/Progress';
import { ErrorState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow, MetricSmall, Title } from '@/components/ui/Text';
import { chapterProgress } from '@/services/analytics/study';
import { toFriendlyError } from '@/services/firebase/errors';
import {
  fetchRevisionsForChapter,
  scheduleRevisionForChapter,
} from '@/services/revisionService';
import {
  createTopic,
  deleteChapter,
  fetchChapter,
  fetchSessionsForChapter,
  fetchSubject,
  fetchTopics,
  setChapterStatus,
  updateChapter,
  updateTopic,
} from '@/services/studyService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import { CHAPTER_STATUS_LABELS, CHAPTER_STATUS_ORDER } from '@/types/models';
import type { Chapter, ChapterStatus, RevisionItem, StudySession, Subject, Topic } from '@/types/models';
import { formatDuration, formatRelativeDate } from '@/utils/date';

const REVISION_CHOICES = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'In 7 days', days: 7 },
  { label: 'In 14 days', days: 14 },
];

export default function ChapterDetail() {
  const { c, space, radius, accent } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string; chapterId: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const refreshChapters = useDataStore((s) => s.refreshChapters);

  const [subject, setSubject] = useState<Subject | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState('');
  const [progressText, setProgressText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!uid || !params.id || !params.chapterId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, ch, topicList, sessionList, revisionList] = await Promise.all([
        fetchSubject(uid, params.id),
        fetchChapter(uid, params.id, params.chapterId),
        fetchTopics(uid, params.id, params.chapterId),
        fetchSessionsForChapter(uid, params.chapterId),
        fetchRevisionsForChapter(uid, params.chapterId),
      ]);
      if (!s || !ch) {
        setError('This chapter no longer exists.');
      } else {
        setSubject(s);
        setChapter(ch);
        setProgressText(String(chapterProgress(ch)));
        setTopics(topicList);
        setSessions(sessionList);
        setRevisions(revisionList);
      }
    } catch (e) {
      setError(toFriendlyError(e, 'Could not load the chapter').message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, params.id, params.chapterId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading && !chapter) {
    return (
      <Screen>
        <AppHeader showBack title="Chapter" />
        <View style={{ padding: 16 }}>
          <SkeletonCard lines={3} />
        </View>
      </Screen>
    );
  }

  if (error || !chapter || !subject) {
    return (
      <Screen>
        <AppHeader showBack title="Chapter" />
        <View style={{ padding: 16 }}>
          <ErrorState message={error ?? 'Chapter not found.'} onRetry={load} />
        </View>
      </Screen>
    );
  }

  const progress = chapterProgress(chapter);
  const dueRevision = revisions.find((r) => r.status === 'due');

  const changeStatus = async (status: ChapterStatus) => {
    if (!uid) return;
    try {
      await setChapterStatus(uid, chapter, status);
      await load();
      await refreshChapters();
      toast.show(`Marked as ${CHAPTER_STATUS_LABELS[status].toLowerCase()}.`);
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not update the chapter').message, 'error');
    }
  };

  return (
    <Screen>
      <AppHeader
        showBack
        eyebrow={subject.name}
        title={chapter.name}
        right={
          <IconButton
            icon="trash-2"
            label="Delete chapter"
            size={40}
            onPress={() => setConfirmDelete(true)}
          />
        }
      />

      <ScreenScroll>
        <View style={{ gap: space.xl, paddingTop: space.sm }}>
          <View
            style={{
              padding: space.base,
              gap: space.md,
              backgroundColor: c.surface2,
              borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: c.line,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
              <MetricSmall tone="strong" style={{ fontSize: 30, lineHeight: 32 }}>
                {progress}%
              </MetricSmall>
              <Caption tone="faint" style={{ flex: 1 }}>
                {CHAPTER_STATUS_LABELS[chapter.status]}
              </Caption>
              <Caption tone="faint">
                {formatDuration(chapter.totalStudyMinutes, '0m')} studied
              </Caption>
            </View>
            <ProgressBar value={progress} color={subject.color} />
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Status" />
            <ChipGroup>
              {CHAPTER_STATUS_ORDER.map((status) => (
                <Chip
                  key={status}
                  label={CHAPTER_STATUS_LABELS[status]}
                  selected={chapter.status === status}
                  onPress={() => changeStatus(status)}
                />
              ))}
            </ChipGroup>
            <Caption tone="faint">
              Time studied never changes this on its own — you decide when a chapter has moved on.
            </Caption>
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Progress" />
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
              <TextField
                containerStyle={{ flex: 1 }}
                label="Percent complete"
                value={progressText}
                onChangeText={setProgressText}
                keyboardType="number-pad"
              />
              <Button
                label="Save"
                onPress={async () => {
                  if (!uid) return;
                  const parsed = Math.max(0, Math.min(100, Number(progressText) || 0));
                  await updateChapter(uid, subject.id, chapter.id, { progress: parsed });
                  await load();
                  await refreshChapters();
                  toast.show('Progress updated.');
                }}
              />
            </View>
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Confidence" />
            <RatingPicker
              value={chapter.confidence}
              onChange={async (value) => {
                if (!uid) return;
                await updateChapter(uid, subject.id, chapter.id, { confidence: value });
                await load();
              }}
            />
            <Caption tone="faint">
              How well could you handle an exam question on this today?
            </Caption>
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Revision" />
            {dueRevision ? (
              <View
                style={{
                  padding: space.base,
                  gap: 4,
                  borderLeftWidth: 2,
                  borderLeftColor: accent.base,
                  backgroundColor: c.surface1,
                }}>
                <Eyebrow color={accent.base}>Scheduled</Eyebrow>
                <Body>
                  Revision {dueRevision.revisionNumber} due{' '}
                  {formatRelativeDate(dueRevision.dueDateKey)}
                </Body>
              </View>
            ) : (
              <ChipGroup>
                {REVISION_CHOICES.map((choice) => (
                  <Chip
                    key={choice.label}
                    label={choice.label}
                    onPress={async () => {
                      if (!uid) return;
                      await scheduleRevisionForChapter(uid, chapter, choice.days);
                      await load();
                      toast.show('Revision scheduled.');
                    }}
                  />
                ))}
              </ChipGroup>
            )}
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Topics" meta={`${topics.length}`} />
            {topics.length === 0 ? (
              <Caption tone="faint">
                Optional. Chapter-only tracking works fine — add topics only if they help.
              </Caption>
            ) : (
              <View
                style={{
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                  borderRadius: radius.card,
                  overflow: 'hidden',
                  backgroundColor: c.surface2,
                }}>
                {topics.map((topic, index) => (
                  <Pressable
                    key={topic.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${topic.name}, ${CHAPTER_STATUS_LABELS[topic.status]}`}
                    onPress={async () => {
                      if (!uid) return;
                      const nextStatus: ChapterStatus =
                        topic.status === 'completed' ? 'learning' : 'completed';
                      await updateTopic(uid, subject.id, chapter.id, topic.id, {
                        status: nextStatus,
                        progress: nextStatus === 'completed' ? 100 : topic.progress,
                      });
                      await load();
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      padding: space.md,
                      backgroundColor: pressed ? c.surface3 : 'transparent',
                      borderTopWidth: index > 0 ? StyleSheet.hairlineWidth * 2 : 0,
                      borderTopColor: c.line,
                    })}>
                    <Icon
                      name={topic.status === 'completed' ? 'check-square' : 'square'}
                      size={16}
                      color={topic.status === 'completed' ? accent.base : c.text40}
                    />
                    <Body
                      style={{
                        flex: 1,
                        textDecorationLine: topic.status === 'completed' ? 'line-through' : 'none',
                      }}
                      tone={topic.status === 'completed' ? 'faint' : 'default'}>
                      {topic.name}
                    </Body>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
              <TextField
                containerStyle={{ flex: 1 }}
                value={newTopic}
                onChangeText={setNewTopic}
                placeholder="Add a topic"
                returnKeyType="done"
                onSubmitEditing={async () => {
                  if (!uid || !newTopic.trim()) return;
                  await createTopic(uid, subject.id, chapter.id, newTopic, topics.length);
                  setNewTopic('');
                  await load();
                }}
              />
              <IconButton
                icon="plus"
                label="Add topic"
                size={48}
                onPress={async () => {
                  if (!uid || !newTopic.trim()) return;
                  await createTopic(uid, subject.id, chapter.id, newTopic, topics.length);
                  setNewTopic('');
                  await load();
                }}
              />
            </View>
          </View>

          <Button
            label="Start study on this chapter"
            icon="play"
            full
            onPress={() =>
              router.push(`/focus/setup?subjectId=${subject.id}&chapterId=${chapter.id}`)
            }
          />

          {sessions.length > 0 ? (
            <View>
              <SectionHeader title="Sessions" meta={`${sessions.length}`} />
              <View style={{ gap: space.sm }}>
                {sessions.slice(0, 10).map((session) => (
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
                    <Icon name="clock" size={14} color={c.text40} />
                    <View style={{ flex: 1 }}>
                      <Body numberOfLines={1}>
                        {session.notes || formatRelativeDate(session.dateKey)}
                      </Body>
                      <Caption tone="faint">
                        {session.source === 'manual' ? 'Logged manually' : 'Timed'}
                        {session.confidence ? ` · confidence ${session.confidence}/5` : ''}
                      </Caption>
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

      <ConfirmationDialog
        visible={confirmDelete}
        title="Delete this chapter?"
        message={`${topics.length} topic${topics.length === 1 ? '' : 's'} will be deleted. ${sessions.length} recorded session${sessions.length === 1 ? '' : 's'} stay in your history but are unlinked.`}
        destructive
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!uid) return;
          await deleteChapter(uid, subject.id, chapter.id);
          await refreshChapters();
          setConfirmDelete(false);
          toast.show('Chapter deleted.');
          router.back();
        }}
      />
    </Screen>
  );
}
