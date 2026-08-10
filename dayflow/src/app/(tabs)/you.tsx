import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { GUTTER, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid } from '@/components/ui/MetricCard';
import { Caption, Display, Eyebrow, Title } from '@/components/ui/Text';
import { calculateWeeklySummary } from '@/services/analytics/weekly';
import { fetchDailySummaries } from '@/services/summaryService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import {
  endOfWeek,
  formatDuration,
  minutesToTime,
  startOfWeek,
  todayKey,
} from '@/utils/date';

export default function You() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const profile = useAuthStore((s) => s.profile);
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const signOut = useAuthStore((s) => s.signOut);
  const teardown = useDataStore((s) => s.teardown);

  const [week, setWeek] = useState<ReturnType<typeof calculateWeeklySummary> | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const today = todayKey();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!uid) return;
        const start = startOfWeek(today, settings.weekStart);
        const end = endOfWeek(today, settings.weekStart);
        const summaries = await fetchDailySummaries(uid, start, end).catch(() => []);
        if (!cancelled) setWeek(calculateWeeklySummary(start, end, summaries));
      })();
      return () => {
        cancelled = true;
      };
    }, [uid, today, settings.weekStart]),
  );

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : '—';

  return (
    <Screen>
      <View style={{ paddingHorizontal: GUTTER, paddingVertical: space.md }}>
        <Eyebrow tone="faint">You</Eyebrow>
        <Display tone="strong">Profile</Display>
      </View>

      <ScreenScroll>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.base,
            padding: space.base,
            backgroundColor: c.surface2,
            borderRadius: radius.card,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: c.line,
          }}>
          <View
            style={{
              width: 56,
              height: 56,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(accent.base, 0.16),
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: withAlpha(accent.base, 0.4),
            }}>
            <Eyebrow color={accent.base} style={{ fontSize: 17, letterSpacing: 0.5 }}>
              {initials(profile?.name)}
            </Eyebrow>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Title tone="strong" numberOfLines={1}>
              {profile?.name ?? '—'}
            </Title>
            <Caption tone="faint" numberOfLines={1}>
              {profile?.email ?? ''}
            </Caption>
            <Caption tone="faint">Member since {memberSince}</Caption>
          </View>
        </View>

        <View style={{ paddingTop: space.lg }}>
          <SectionHeader title="This week" />
          <MetricGrid columns={2}>
            <MetricCard
              label="Study"
              value={formatDuration(week?.studyMinutes ?? 0, '0m')}
              icon="book"
            />
            <MetricCard
              label="Routines"
              value={`${week?.routineConsistency ?? 0}%`}
              icon="repeat"
            />
            <MetricCard
              label="Tasks"
              value={`${week?.tasksCompleted ?? 0}/${week?.tasksPlanned ?? 0}`}
              icon="check-square"
            />
            <MetricCard
              label="Wake average"
              value={
                week?.wakeAverageMinutes === null || week?.wakeAverageMinutes === undefined
                  ? '—'
                  : minutesToTime(week.wakeAverageMinutes)
              }
              icon="sunrise"
            />
          </MetricGrid>
        </View>

        <View style={{ paddingTop: space.xl }}>
          <SectionHeader title="Settings" />
          <View
            style={{
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: c.line,
              borderRadius: radius.card,
              overflow: 'hidden',
              backgroundColor: c.surface2,
              paddingHorizontal: space.base,
            }}>
            <ListRow label="Account" icon="user" onPress={() => router.push('/settings/profile')} />
            <Divider />
            <ListRow
              label="Routine preferences"
              icon="sliders"
              subtitle="Wake target, tolerance, week start"
              onPress={() => router.push('/settings/preferences')}
            />
            <Divider />
            <ListRow
              label="Study preferences"
              icon="book"
              subtitle="Default timer length, reminders"
              onPress={() => router.push('/settings/study')}
            />
            <Divider />
            <ListRow
              label="Notifications"
              icon="bell"
              onPress={() => router.push('/settings/notifications')}
            />
            <Divider />
            <ListRow
              label="Categories"
              icon="grid"
              onPress={() => router.push('/settings/categories')}
            />
            <Divider />
            <ListRow
              label="Appearance"
              icon="droplet"
              onPress={() => router.push('/settings/appearance')}
            />
            <Divider />
            <ListRow
              label="Data"
              icon="download"
              subtitle="Export, delete account"
              onPress={() => router.push('/settings/data')}
            />
            <Divider />
            <ListRow label="About" icon="info" onPress={() => router.push('/settings/about')} />
          </View>
        </View>

        <View style={{ paddingTop: space.xl, gap: space.sm }}>
          <SectionHeader title="Reviews" />
          <Button
            label="Daily review"
            icon="moon"
            variant="outline"
            full
            onPress={() => router.push(`/review/daily?date=${today}`)}
          />
          <Button
            label="Weekly review"
            icon="bar-chart-2"
            variant="outline"
            full
            onPress={() => router.push('/review/weekly')}
          />
          <Button
            label="Browse history"
            icon="clock"
            variant="outline"
            full
            onPress={() => router.push(`/history/${today}`)}
          />
        </View>

        <View style={{ paddingTop: space.xl }}>
          <Button
            label="Log out"
            icon="log-out"
            variant="danger"
            full
            onPress={() => setConfirmLogout(true)}
          />
        </View>
      </ScreenScroll>

      <ConfirmationDialog
        visible={confirmLogout}
        title="Log out?"
        message="Your data stays in your account. You can sign back in any time."
        confirmLabel="Log out"
        destructive
        onCancel={() => setConfirmLogout(false)}
        onConfirm={async () => {
          setConfirmLogout(false);
          teardown();
          await signOut();
          toast.show('Signed out.');
        }}
      />
    </Screen>
  );
}

function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }} />;
}

function initials(name?: string | null): string {
  if (!name) return 'D';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}
