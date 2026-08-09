import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup, RatingPicker, TextField } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { DateField } from '@/components/ui/Pickers';
import { ProgressBar } from '@/components/ui/Progress';
import { ErrorState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, MetricSmall } from '@/components/ui/Text';
import { progressForTopic } from '@/services/analytics/aggregate';
import { toFriendlyError } from '@/services/firebase/errors';
import {
  TOPIC_STATUS_LABELS,
  TOPIC_STATUS_ORDER,
  deleteTopic,
  fetchSessionsForTopic,
  fetchSubject,
  fetchTopics,
  setTopicStatus,
  updateTopic,
} from '@/services/studyService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { StudySession, Subject, Topic, TopicStatus } from '@/types/models';
import { formatDuration, formatRelativeDate } from '@/utils/date';

export default function TopicDetail() {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{ id: string; topicId: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);

  const [subject, setSubject] = useState<Subject | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!uid || !params.id || !params.topicId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, topicList, sess] = await Promise.all([
        fetchSubject(uid, params.id),
        fetchTopics(uid, params.id),
        fetchSessionsForTopic(uid, params.topicId),
      ]);
      const found = topicList.find((t) => t.id === params.topicId) ?? null;
      if (!s || !found) {
        setError('This topic no longer exists.');
      } else {
        setSubject(s);
        setTopic(found);
        setNotes(found.description ?? '');
        setSessions(sess);
      }
    } catch (e) {
      setError(toFriendlyError(e, 'Could not load the topic').message);
    } finally {
      setLoading(false);
    }
     
  }, [uid, params.id, params.topicId]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (status: TopicStatus) => {
    if (!uid || !topic) return;
    try {
      await setTopicStatus(uid, topic, status);
      await load();
      toast.show(`Marked as ${TOPIC_STATUS_LABELS[status].toLowerCase()}.`);
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not update the topic').message, 'error');
    }
  };

  if (loading && !topic) {
    return (
      <Screen>
        <AppHeader showBack title="Topic" />
        <View style={{ padding: 16, gap: 12 }}>
          <SkeletonCard lines={3} />
        </View>
      </Screen>
    );
  }

  if (error || !topic || !subject) {
    return (
      <Screen>
        <AppHeader showBack title="Topic" />
        <View style={{ padding: 16 }}>
          <ErrorState message={error ?? 'Topic not found.'} onRetry={load} />
        </View>
      </Screen>
    );
  }

  const progress = progressForTopic(topic);

  return (
    <Screen>
      <AppHeader
        showBack
        eyebrow={subject.name}
        title={topic.name}
        right={
          <IconButton
            icon="trash-2"
            label="Delete topic"
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
                {TOPIC_STATUS_LABELS[topic.status]}
              </Caption>
              <Caption tone="faint">{formatDuration(topic.actualMinutes, '0m')} studied</Caption>
            </View>
            <ProgressBar value={progress} color={subject.color} />
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Status" />
            <ChipGroup>
              {TOPIC_STATUS_ORDER.map((status) => (
                <Chip
                  key={status}
                  label={TOPIC_STATUS_LABELS[status]}
                  selected={topic.status === status}
                  onPress={() => changeStatus(status)}
                />
              ))}
            </ChipGroup>
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Confidence" />
            <RatingPicker
              value={topic.confidence ?? null}
              onChange={async (value) => {
                if (!uid) return;
                await updateTopic(uid, subject.id, topic.id, { confidence: value });
                await load();
              }}
            />
            <Caption tone="faint">How well could you handle an exam question on this today?</Caption>
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Revision" />
            <DateField
              label="Next revision"
              value={topic.nextRevisionDate ?? null}
              onChange={async (date) => {
                if (!uid) return;
                await updateTopic(uid, subject.id, topic.id, { nextRevisionDate: date });
                await load();
              }}
              weekStart={settings.weekStart}
              clearLabel="Not scheduled"
            />
            {topic.lastStudiedAt ? (
              <Caption tone="faint">
                Last studied {new Date(topic.lastStudiedAt).toLocaleDateString()}
              </Caption>
            ) : null}
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Notes" />
            <TextField
              value={notes}
              onChangeText={setNotes}
              placeholder="Formulas, weak spots, references…"
              multiline
              onBlur={async () => {
                if (!uid) return;
                if ((topic.description ?? '') === notes) return;
                await updateTopic(uid, subject.id, topic.id, { description: notes || null });
              }}
            />
          </View>

          <Button
            label="Start focus on this topic"
            icon="play"
            full
            onPress={() =>
              router.push(
                `/focus/setup?subjectId=${subject.id}&title=${encodeURIComponent(topic.name)}`,
              )
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
                        {session.notes || formatRelativeDate(session.date)}
                      </Body>
                      {session.productivityRating ? (
                        <Caption tone="faint">Rated {session.productivityRating}/5</Caption>
                      ) : null}
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

      <ConfirmationDialog
        visible={confirmDelete}
        title="Delete this topic?"
        message={`${sessions.length} recorded session${sessions.length === 1 ? '' : 's'} will be kept in your history but unlinked.`}
        destructive
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!uid) return;
          await deleteTopic(uid, subject.id, topic.id);
          setConfirmDelete(false);
          toast.show('Topic deleted.');
          router.back();
        }}
      />
    </Screen>
  );
}
