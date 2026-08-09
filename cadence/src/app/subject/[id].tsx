import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { progressForTopic } from '@/services/analytics/aggregate';
import { toFriendlyError } from '@/services/firebase/errors';
import {
  TOPIC_STATUS_LABELS,
  countSubjectHistory,
  createTopic,
  deleteSubject,
  fetchSessionsInRange,
  fetchSubject,
  fetchTopics,
} from '@/services/studyService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { StudySession, Subject, Topic } from '@/types/models';
import { addDays, formatDuration, formatRelativeDate, todayKey } from '@/utils/date';

export default function SubjectDetail() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);

  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [history, setHistory] = useState<{ topics: number; sessions: number; minutes: number } | null>(
    null,
  );

  const today = todayKey();

  const load = useCallback(async () => {
    if (!uid || !params.id) return;
    setLoading(true);
    setError(null);
    try {
      const [s, t, sess] = await Promise.all([
        fetchSubject(uid, params.id),
        fetchTopics(uid, params.id),
        fetchSessionsInRange(uid, addDays(today, -180), today),
      ]);
      if (!s) {
        setError('This subject no longer exists.');
      } else {
        setSubject(s);
        setTopics(t);
        setSessions(sess.filter((x) => x.subjectId === params.id));
      }
    } catch (e) {
      setError(toFriendlyError(e, 'Could not load the subject').message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const minutes = sessions.reduce((a, s) => a + s.durationMinutes, 0);
    const completed = topics.filter((t) => t.status === 'completed').length;
    const progress =
      topics.length > 0
        ? Math.round(topics.reduce((a, t) => a + progressForTopic(t), 0) / topics.length)
        : 0;
    const revisions = topics
      .filter((t) => t.nextRevisionDate)
      .sort((a, b) => (a.nextRevisionDate! < b.nextRevisionDate! ? -1 : 1));
    return { minutes, completed, progress, revisions };
  }, [sessions, topics]);

  const category = categories.find((cat) => cat.id === subject?.categoryId);

  const addTopic = async () => {
    if (!uid || !subject || !newTopic.trim()) return;
    try {
      await createTopic(uid, subject.id, { name: newTopic, order: topics.length });
      setNewTopic('');
      setAddingTopic(false);
      await load();
      toast.show('Topic added.');
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not add the topic').message, 'error');
    }
  };

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

  if (error || !subject) {
    return (
      <Screen>
        <AppHeader showBack title="Subject" />
        <View style={{ padding: 16 }}>
          <ErrorState message={error ?? 'Subject not found.'} onRetry={load} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader
        showBack
        eyebrow={category?.name ?? 'Study'}
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
            <ProgressRing value={summary.progress} size={96} thickness={7} color={subject.color}>
              <Metric tone="strong">{summary.progress}</Metric>
            </ProgressRing>
            <View style={{ flex: 1, gap: 6 }}>
              <View>
                <Eyebrow tone="faint">Topics</Eyebrow>
                <Title tone="strong">
                  {summary.completed} / {topics.length}
                </Title>
              </View>
              <View>
                <Eyebrow tone="faint">Studied</Eyebrow>
                <Title tone="strong">{formatDuration(summary.minutes, '0m')}</Title>
              </View>
              {subject.examDate ? (
                <Caption tone="faint">Exam {formatRelativeDate(subject.examDate)}</Caption>
              ) : subject.targetDate ? (
                <Caption tone="faint">Target {formatRelativeDate(subject.targetDate)}</Caption>
              ) : null}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              label="Start focus"
              icon="play"
              style={{ flex: 1 }}
              onPress={() => router.push(`/focus/setup?subjectId=${subject.id}`)}
            />
            <Button
              label="Add topic"
              icon="plus"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setAddingTopic(true)}
            />
          </View>

          {summary.revisions.length > 0 ? (
            <View>
              <SectionHeader title="Upcoming revision" />
              <View style={{ gap: space.sm }}>
                {summary.revisions.slice(0, 3).map((topic) => (
                  <View
                    key={topic.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      padding: space.md,
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: c.line,
                      borderRadius: radius.card,
                    }}>
                    <Icon name="rotate-ccw" size={15} color={c.text40} />
                    <Body style={{ flex: 1 }} numberOfLines={1}>
                      {topic.name}
                    </Body>
                    <Caption
                      tone={topic.nextRevisionDate! <= today ? 'default' : 'faint'}
                      color={topic.nextRevisionDate! <= today ? accent.base : undefined}>
                      {formatRelativeDate(topic.nextRevisionDate!)}
                    </Caption>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View>
            <SectionHeader title="Topics" meta={`${topics.length}`} />
            {topics.length === 0 ? (
              <EmptyState
                icon="list"
                title="No topics yet"
                message="Break the syllabus into topics you can tick off."
                actionLabel="Add topic"
                onAction={() => setAddingTopic(true)}
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
                {topics.map((topic, i) => (
                  <Pressable
                    key={topic.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${topic.name}, ${TOPIC_STATUS_LABELS[topic.status]}`}
                    onPress={() => router.push(`/subject/${subject.id}/topic/${topic.id}`)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      padding: space.md,
                      backgroundColor: pressed ? c.surface3 : 'transparent',
                      borderTopWidth: i > 0 ? StyleSheet.hairlineWidth * 2 : 0,
                      borderTopColor: c.line,
                    })}>
                    <View style={{ width: 40 }}>
                      <MetricSmall
                        tone={topic.status === 'completed' ? 'accent' : 'meta'}
                        color={topic.status === 'completed' ? subject.color : undefined}>
                        {progressForTopic(topic)}
                      </MetricSmall>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Body numberOfLines={1}>{topic.name}</Body>
                      <Caption tone="faint">
                        {[
                          TOPIC_STATUS_LABELS[topic.status],
                          topic.actualMinutes ? formatDuration(topic.actualMinutes) : null,
                          topic.confidence ? `Confidence ${topic.confidence}/5` : null,
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
                          Math.max(0.15, progressForTopic(topic) / 100),
                        ),
                      }}
                    />
                    <Icon name="chevron-right" size={15} color={c.text30} />
                  </Pressable>
                ))}
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
                    <Icon name="clock" size={14} color={c.text40} />
                    <View style={{ flex: 1 }}>
                      <Body numberOfLines={1}>{session.label ?? 'Focus session'}</Body>
                      <Caption tone="faint">{formatRelativeDate(session.date)}</Caption>
                    </View>
                    <MetricSmall tone="strong">
                      {formatDuration(session.durationMinutes)}
                    </MetricSmall>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScreenScroll>

      <BottomSheet
        visible={addingTopic}
        onClose={() => setAddingTopic(false)}
        title="Add topic"
        eyebrow={subject.name}
        footer={<Button label="Add" full onPress={addTopic} disabled={!newTopic.trim()} />}>
        <View style={{ paddingBottom: space.base }}>
          <TextField
            value={newTopic}
            onChangeText={setNewTopic}
            placeholder="Conditional probability"
            autoFocus
            onSubmitEditing={addTopic}
          />
        </View>
      </BottomSheet>

      <ConfirmationDialog
        visible={confirmDelete}
        title="Delete this subject?"
        message={
          history
            ? `${history.topics} topic${history.topics === 1 ? '' : 's'} will be deleted. ${history.sessions} recorded session${history.sessions === 1 ? '' : 's'} (${formatDuration(history.minutes, '0m')}) will be kept in your history but unlinked.`
            : 'Its topics will be deleted. Recorded study sessions are kept.'
        }
        destructive
        confirmLabel="Delete subject"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!uid) return;
          try {
            await deleteSubject(uid, subject.id);
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
