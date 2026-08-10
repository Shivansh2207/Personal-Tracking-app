import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RankedBars } from '@/components/analytics/Charts';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup, SegmentedControl } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { GUTTER, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid } from '@/components/ui/MetricCard';
import { ProgressRing } from '@/components/ui/Progress';
import { EmptyState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Display, Eyebrow, Metric, MetricSmall, Title } from '@/components/ui/Text';
import {
  calculateRevisionCompletion,
  calculateSubjectProgress,
  chapterProgress,
  evaluateSlots,
  forecastSyllabus,
  slotOccurrences,
  splitPlannedAndExtra,
} from '@/services/analytics/study';
import { toFriendlyError } from '@/services/firebase/errors';
import {
  completeRevision,
  fetchRevisions,
  rescheduleRevision,
  skipRevision,
} from '@/services/revisionService';
import { fetchSessionsInRange } from '@/services/studyService';
import { describeSlotDays, deleteSlot } from '@/services/timetableService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { RevisionItem, StudySession } from '@/types/models';
import {
  DAY_LABELS_SHORT,
  addDays,
  dateRange,
  formatDuration,
  formatRelativeDate,
  formatTime,
  lastNDays,
  todayKey,
} from '@/utils/date';

type Segment = 'overview' | 'subjects' | 'timetable' | 'revision' | 'history';

export default function Study() {
  const { c, space, accent, radius, semantic } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { subjects, chapters, slots, refreshChapters } = useDataStore();

  const [segment, setSegment] = useState<Segment>('overview');
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteSlotId, setDeleteSlotId] = useState<string | null>(null);

  const today = todayKey();
  const range = useMemo(() => lastNDays(30, today), [today]);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [sessionList, revisionList] = await Promise.all([
        fetchSessionsInRange(uid, addDays(today, -90), today),
        fetchRevisions(uid),
      ]);
      setSessions(sessionList);
      setRevisions(revisionList);
      await refreshChapters();
    } catch {
      toast.show('Could not load your study data.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const recentSessions = useMemo(
    () => sessions.filter((s) => s.dateKey >= range[0]),
    [sessions, range],
  );
  const split = useMemo(() => splitPlannedAndExtra(recentSessions), [recentSessions]);

  const subjectStats = useMemo(
    () =>
      subjects
        .map((subject) => calculateSubjectProgress(subject, chapters, recentSessions, revisions, today))
        .sort((a, b) => b.minutes - a.minutes),
    [subjects, chapters, recentSessions, revisions, today],
  );

  const slotResults = useMemo(
    () => evaluateSlots(slotOccurrences(slots, range), recentSessions, today),
    [slots, range, recentSessions, today],
  );

  const revisionStats = useMemo(
    () => calculateRevisionCompletion(revisions, today),
    [revisions, today],
  );

  const chaptersCompleted = chapters.filter((ch) => ch.status === 'completed').length;

  const dueRevisions = revisions
    .filter((r) => r.status === 'due' && r.dueDateKey <= today)
    .sort((a, b) => (a.dueDateKey < b.dueDateKey ? -1 : 1));
  const upcomingRevisions = revisions
    .filter((r) => r.status === 'due' && r.dueDateKey > today)
    .sort((a, b) => (a.dueDateKey < b.dueDateKey ? -1 : 1));

  const nameFor = (chapterId: string) => chapters.find((ch) => ch.id === chapterId)?.name ?? 'Chapter';
  const subjectNameFor = (subjectId: string) =>
    subjects.find((s) => s.id === subjectId)?.name ?? '';

  const handleRevision = async (
    item: RevisionItem,
    action: 'complete' | 'skip' | 'tomorrow' | 'week',
  ) => {
    if (!uid) return;
    try {
      if (action === 'complete') await completeRevision(uid, item, true);
      else if (action === 'skip') await skipRevision(uid, item.id);
      else await rescheduleRevision(uid, item.id, addDays(today, action === 'tomorrow' ? 1 : 7));
      await load();
      toast.show(action === 'complete' ? 'Revision logged.' : 'Revision updated.');
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not update the revision').message, 'error');
    }
  };

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: GUTTER,
          paddingVertical: space.md,
          gap: space.md,
        }}>
        <View style={{ flex: 1 }}>
          <Eyebrow tone="faint">Study</Eyebrow>
          <Display tone="strong">{SEGMENT_TITLES[segment]}</Display>
        </View>
        <IconButton
          icon="plus"
          label={segment === 'timetable' ? 'Add timetable slot' : 'Add subject'}
          onPress={() =>
            router.push(segment === 'timetable' ? '/timetable/new' : '/subject/new')
          }
        />
      </View>

      <View style={{ paddingHorizontal: GUTTER, paddingBottom: space.md }}>
        <SegmentedControl
          scrollable
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'subjects', label: 'Subjects' },
            { value: 'timetable', label: 'Timetable' },
            { value: 'revision', label: 'Revision' },
            { value: 'history', label: 'History' },
          ]}
          value={segment}
          onChange={(v) => setSegment(v as Segment)}
        />
      </View>

      <ScreenScroll>
        {loading && sessions.length === 0 && subjects.length === 0 ? (
          <SkeletonCard lines={4} />
        ) : subjects.length === 0 ? (
          <EmptyState
            icon="book"
            title="No subjects yet"
            message="Add your first subject to start building your study system."
            actionLabel="Create subject"
            onAction={() => router.push('/subject/new')}
          />
        ) : (
          <>
            {segment === 'overview' ? (
              <View style={{ gap: space.xl }}>
                <MetricGrid columns={2}>
                  <MetricCard
                    label="Study · 30 days"
                    value={formatDuration(split.totalMinutes, '0m')}
                    caption={`${split.sessionCount} sessions`}
                    icon="clock"
                    large
                  />
                  <MetricCard
                    label="Chapters done"
                    value={`${chaptersCompleted}/${chapters.length}`}
                    icon="check-square"
                    large
                  />
                  <MetricCard
                    label="Planned study"
                    value={formatDuration(split.plannedMinutes, '0m')}
                    caption="from timetable"
                    icon="calendar"
                  />
                  <MetricCard
                    label="Extra study"
                    value={formatDuration(split.extraMinutes, '0m')}
                    caption="unscheduled"
                    icon="zap"
                  />
                  <MetricCard
                    label="Revision due"
                    value={`${revisionStats.dueToday + revisionStats.overdue}`}
                    caption={revisionStats.overdue > 0 ? `${revisionStats.overdue} overdue` : 'on track'}
                    icon="rotate-ccw"
                  />
                  <MetricCard
                    label="Avg session"
                    value={formatDuration(split.averageSessionMinutes, '0m')}
                    icon="activity"
                  />
                </MetricGrid>

                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button
                    label="Start focus"
                    icon="play"
                    style={{ flex: 1 }}
                    onPress={() => router.push('/focus/setup')}
                  />
                  <Button
                    label="Log study"
                    icon="edit-3"
                    variant="outline"
                    style={{ flex: 1 }}
                    onPress={() => router.push('/study/log')}
                  />
                </View>

                {subjectStats.some((s) => s.minutes > 0) ? (
                  <View>
                    <SectionHeader title="Time by subject" meta="30 days" />
                    <View
                      style={{
                        padding: space.base,
                        backgroundColor: c.surface2,
                        borderRadius: radius.card,
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: c.line,
                      }}>
                      <RankedBars
                        suffix=""
                        items={subjectStats
                          .filter((s) => s.minutes > 0)
                          .map((s) => ({
                            label: s.name,
                            value: s.minutes,
                            color: s.color,
                            caption: `${s.chaptersCompleted}/${s.chaptersTotal} chapters`,
                          }))}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {segment === 'subjects' ? (
              <View style={{ gap: space.md }}>
                {subjectStats.map((stat) => {
                  const subject = subjects.find((s) => s.id === stat.subjectId)!;
                  const forecast = forecastSyllabus(
                    chapters.filter((ch) => ch.subjectId === stat.subjectId),
                    subject.examDate ?? subject.targetDate,
                    today,
                  );
                  return (
                    <Pressable
                      key={stat.subjectId}
                      accessibilityRole="button"
                      accessibilityLabel={`${stat.name}, ${stat.syllabusProgress} percent complete`}
                      onPress={() => router.push(`/subject/${stat.subjectId}`)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.base,
                        padding: space.base,
                        backgroundColor: pressed ? c.surface3 : c.surface2,
                        borderRadius: radius.card,
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: c.line,
                      })}>
                      <ProgressRing
                        value={stat.syllabusProgress}
                        size={62}
                        thickness={5}
                        color={stat.color}>
                        <MetricSmall tone="strong">{stat.syllabusProgress}</MetricSmall>
                      </ProgressRing>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Title tone="strong" numberOfLines={1}>
                          {stat.name}
                        </Title>
                        <Caption tone="faint">
                          {stat.chaptersCompleted} / {stat.chaptersTotal} chapters ·{' '}
                          {formatDuration(stat.minutes, '0m')}
                        </Caption>
                        {forecast ? (
                          <Caption tone="faint">
                            {forecast.requiredPacePerWeek} chapters/week to finish in time
                          </Caption>
                        ) : subject.examDate ? (
                          <Caption tone="faint">Exam {formatRelativeDate(subject.examDate)}</Caption>
                        ) : null}
                      </View>
                      <Icon name="chevron-right" size={16} color={c.text30} />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {segment === 'timetable' ? (
              slots.length === 0 ? (
                <EmptyState
                  icon="calendar"
                  title="No timetable yet"
                  message="Add the study slots you actually intend to keep. Each one becomes a startable session on your day."
                  actionLabel="Add slot"
                  onAction={() => router.push('/timetable/new')}
                />
              ) : (
                <View style={{ gap: space.lg }}>
                  <WeekTimetable
                    slots={slots}
                    subjects={subjects}
                    use24Hour={settings.use24HourTime}
                    onPress={(id) => router.push(`/timetable/new?edit=${id}`)}
                    onDelete={setDeleteSlotId}
                  />
                  <View
                    style={{
                      padding: space.base,
                      gap: 4,
                      backgroundColor: c.surface2,
                      borderRadius: radius.card,
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: c.line,
                    }}>
                    <Eyebrow tone="faint">Adherence · 30 days</Eyebrow>
                    <Metric tone="strong">
                      {slotResults.length > 0
                        ? `${Math.round(
                            (slotResults.reduce(
                              (a, r) =>
                                a +
                                (r.plannedMinutes > 0
                                  ? Math.min(1, r.actualMinutes / r.plannedMinutes)
                                  : 0),
                              0,
                            ) /
                              slotResults.length) *
                              100,
                          )}%`
                        : '—'}
                    </Metric>
                    <Caption tone="faint">
                      {slotResults.filter((r) => r.outcome === 'completed').length} completed ·{' '}
                      {slotResults.filter((r) => r.outcome === 'partial').length} partial ·{' '}
                      {slotResults.filter((r) => r.outcome === 'missed').length} missed
                    </Caption>
                  </View>
                </View>
              )
            ) : null}

            {segment === 'revision' ? (
              <View style={{ gap: space.xl }}>
                <View>
                  <SectionHeader title="Due today" meta={`${dueRevisions.length}`} />
                  {dueRevisions.length === 0 ? (
                    <Body tone="faint" style={{ fontSize: 13 }}>
                      Nothing due. Revisions appear here once you schedule them from a chapter.
                    </Body>
                  ) : (
                    <View style={{ gap: space.sm }}>
                      {dueRevisions.map((item) => (
                        <View
                          key={item.id}
                          style={{
                            padding: space.base,
                            gap: space.md,
                            backgroundColor: c.surface2,
                            borderRadius: radius.card,
                            borderWidth: StyleSheet.hairlineWidth * 2,
                            borderColor:
                              item.dueDateKey < today
                                ? withAlpha(semantic.warning, 0.4)
                                : c.line,
                          }}>
                          <View>
                            <Title tone="strong">{nameFor(item.chapterId)}</Title>
                            <Caption tone="faint">
                              {subjectNameFor(item.subjectId)} · revision {item.revisionNumber}
                              {item.dueDateKey < today ? ` · due ${formatRelativeDate(item.dueDateKey)}` : ''}
                            </Caption>
                          </View>
                          <ChipGroup>
                            <Chip
                              label="Mark revised"
                              icon="check"
                              onPress={() => handleRevision(item, 'complete')}
                            />
                            <Chip
                              label="Start session"
                              icon="play"
                              onPress={() =>
                                router.push(
                                  `/focus/setup?subjectId=${item.subjectId}&chapterId=${item.chapterId}&source=revision`,
                                )
                              }
                            />
                            <Chip
                              label="Tomorrow"
                              onPress={() => handleRevision(item, 'tomorrow')}
                            />
                            <Chip label="Skip" onPress={() => handleRevision(item, 'skip')} />
                          </ChipGroup>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {upcomingRevisions.length > 0 ? (
                  <View>
                    <SectionHeader title="Upcoming" meta={`${upcomingRevisions.length}`} />
                    <View
                      style={{
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: c.line,
                        borderRadius: radius.card,
                        overflow: 'hidden',
                        backgroundColor: c.surface2,
                      }}>
                      {upcomingRevisions.slice(0, 12).map((item, index) => (
                        <View
                          key={item.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: space.md,
                            padding: space.md,
                            borderTopWidth: index > 0 ? StyleSheet.hairlineWidth * 2 : 0,
                            borderTopColor: c.line,
                          }}>
                          <Icon name="rotate-ccw" size={14} color={c.text40} />
                          <View style={{ flex: 1 }}>
                            <Body numberOfLines={1}>{nameFor(item.chapterId)}</Body>
                            <Caption tone="faint">{subjectNameFor(item.subjectId)}</Caption>
                          </View>
                          <Caption tone="meta">{formatRelativeDate(item.dueDateKey)}</Caption>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {revisionStats.completionRate !== null ? (
                  <Caption tone="faint">
                    {revisionStats.completed} revisions completed ·{' '}
                    {revisionStats.completionRate}% of those that came due.
                  </Caption>
                ) : null}
              </View>
            ) : null}

            {segment === 'history' ? (
              sessions.length === 0 ? (
                <EmptyState
                  icon="clock"
                  title="No sessions yet"
                  message="Start a focus session or log study you already did — both land here."
                  actionLabel="Log study"
                  onAction={() => router.push('/study/log')}
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
                  {sessions.slice(0, 40).map((session, index) => (
                    <Pressable
                      key={session.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Study session on ${session.dateKey}`}
                      onPress={() => router.push(`/history/${session.dateKey}`)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                        backgroundColor: pressed ? c.surface3 : 'transparent',
                        borderTopWidth: index > 0 ? StyleSheet.hairlineWidth * 2 : 0,
                        borderTopColor: c.line,
                      })}>
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: withAlpha(
                            subjects.find((s) => s.id === session.subjectId)?.color ?? accent.base,
                            0.16,
                          ),
                        }}>
                        <Icon
                          name={session.timetableSlotId ? 'calendar' : 'edit-3'}
                          size={13}
                          color={
                            subjects.find((s) => s.id === session.subjectId)?.color ?? accent.base
                          }
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Body numberOfLines={1}>
                          {subjectNameFor(session.subjectId ?? '') || 'Study'}
                          {session.chapterId ? ` · ${nameFor(session.chapterId)}` : ''}
                        </Body>
                        <Caption tone="faint">
                          {formatRelativeDate(session.dateKey)} ·{' '}
                          {session.timetableSlotId ? 'scheduled' : 'extra'}
                          {session.source === 'manual' ? ' · logged manually' : ''}
                        </Caption>
                      </View>
                      <MetricSmall tone="strong">
                        {formatDuration(session.actualMinutes)}
                      </MetricSmall>
                    </Pressable>
                  ))}
                </View>
              )
            ) : null}
          </>
        )}
      </ScreenScroll>

      <ConfirmationDialog
        visible={!!deleteSlotId}
        title="Delete this slot?"
        message="Past study sessions stay in your history; only the schedule is removed."
        destructive
        confirmLabel="Delete"
        onCancel={() => setDeleteSlotId(null)}
        onConfirm={async () => {
          if (!uid || !deleteSlotId) return;
          await deleteSlot(uid, deleteSlotId);
          setDeleteSlotId(null);
          toast.show('Slot deleted.');
        }}
      />
    </Screen>
  );
}

const SEGMENT_TITLES: Record<Segment, string> = {
  overview: 'Overview',
  subjects: 'Subjects',
  timetable: 'Timetable',
  revision: 'Revision',
  history: 'History',
};

/** Mobile week view: one column-free block per weekday, in time order. */
function WeekTimetable({
  slots,
  subjects,
  use24Hour,
  onPress,
  onDelete,
}: {
  slots: import('@/types/models').TimetableSlot[];
  subjects: import('@/types/models').Subject[];
  use24Hour: boolean;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { c, space, radius } = useTheme();
  const byDay = useMemo(() => {
    const map: Record<number, typeof slots> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const slot of slots) {
      if (!slot.active) continue;
      for (const day of slot.daysOfWeek) map[day]?.push(slot);
    }
    for (const day of Object.keys(map)) {
      map[Number(day)].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [slots]);

  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <View style={{ gap: space.md }}>
      {order.map((day) => {
        const daySlots = byDay[day];
        if (daySlots.length === 0) return null;
        return (
          <View key={day} style={{ gap: space.sm }}>
            <Eyebrow tone="meta">{DAY_LABELS_SHORT[day]}</Eyebrow>
            {daySlots.map((slot) => {
              const subject = subjects.find((s) => s.id === slot.subjectId);
              return (
                <Pressable
                  key={`${day}-${slot.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${subject?.name ?? 'Subject'} at ${slot.startTime}`}
                  onPress={() => onPress(slot.id)}
                  onLongPress={() => onDelete(slot.id)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    padding: space.md,
                    backgroundColor: pressed ? c.surface3 : c.surface2,
                    borderRadius: radius.card,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                  })}>
                  <View
                    style={{ width: 3, alignSelf: 'stretch', backgroundColor: subject?.color ?? c.line }}
                  />
                  <View style={{ flex: 1 }}>
                    <Body numberOfLines={1}>{subject?.name ?? 'Subject'}</Body>
                    <Caption tone="faint">
                      {formatTime(slot.startTime, use24Hour)} · {slot.durationMinutes} min ·{' '}
                      {slot.chapterMode === 'fixed' ? 'fixed chapter' : 'next incomplete'}
                    </Caption>
                  </View>
                  <Caption tone="faint">{describeSlotDays(slot)}</Caption>
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
