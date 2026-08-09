import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { GUTTER, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid } from '@/components/ui/MetricCard';
import { Caption, Display, Eyebrow, Title } from '@/components/ui/Text';
import { calculateStreak } from '@/services/analytics/score';
import { fetchStatsInRange } from '@/services/statsService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import { addDays, formatDuration, todayKey } from '@/utils/date';

export default function Profile() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const profile = useAuthStore((s) => s.profile);
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const signOut = useAuthStore((s) => s.signOut);
  const teardown = useDataStore((s) => s.teardown);

  const [totals, setTotals] = useState({ tasks: 0, focus: 0, streak: 0, days: 0 });
  const [confirmLogout, setConfirmLogout] = useState(false);

  const today = todayKey();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!uid) return;
        const stats = await fetchStatsInRange(uid, addDays(today, -364), today).catch(() => []);
        if (cancelled) return;
        setTotals({
          tasks: stats.reduce((a, s) => a + s.tasksCompleted, 0),
          focus: stats.reduce((a, s) => a + s.focusMinutes, 0),
          streak: calculateStreak(
            new Map(stats.map((s) => [s.date, { dayState: s.dayState }])),
            today,
          ),
          days: stats.filter((s) => s.dayState !== 'no_data').length,
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [uid, today]),
  );

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
    : '—';

  return (
    <Screen>
      <View style={{ paddingHorizontal: GUTTER, paddingVertical: space.md }}>
        <Eyebrow tone="faint">Profile</Eyebrow>
        <Display tone="strong">You</Display>
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
              width: 58,
              height: 58,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(accent.base, 0.16),
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: withAlpha(accent.base, 0.4),
            }}>
            <Eyebrow color={accent.base} style={{ fontSize: 18, letterSpacing: 0.5 }}>
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
          <MetricGrid columns={2}>
            <MetricCard label="Current streak" value={`${totals.streak}`} caption="days" icon="zap" />
            <MetricCard label="Days tracked" value={`${totals.days}`} icon="calendar" />
            <MetricCard label="Tasks completed" value={`${totals.tasks}`} icon="check-square" />
            <MetricCard
              label="Focus time"
              value={formatDuration(totals.focus, '0m')}
              icon="clock"
            />
          </MetricGrid>
        </View>

        {profile?.mainGoal ? (
          <View
            style={{
              marginTop: space.lg,
              padding: space.base,
              borderLeftWidth: 2,
              borderLeftColor: accent.base,
              backgroundColor: c.surface1,
            }}>
            <Eyebrow color={accent.base}>Main goal</Eyebrow>
            <Title style={{ paddingTop: 4 }}>{profile.mainGoal}</Title>
          </View>
        ) : null}

        <View style={{ paddingTop: space.xl }}>
          <SectionHeader title="Manage" />
          <View
            style={{
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: c.line,
              borderRadius: radius.card,
              overflow: 'hidden',
              backgroundColor: c.surface2,
              paddingHorizontal: space.base,
            }}>
            <ListRow
              label="Edit profile"
              icon="user"
              onPress={() => router.push('/settings/profile')}
            />
            <Divider />
            <ListRow
              label="Preferences"
              icon="sliders"
              subtitle="Week start, time format, score threshold"
              onPress={() => router.push('/settings/preferences')}
            />
            <Divider />
            <ListRow
              label="Categories"
              icon="grid"
              onPress={() => router.push('/settings/categories')}
            />
            <Divider />
            <ListRow
              label="Notifications"
              icon="bell"
              onPress={() => router.push('/settings/notifications')}
            />
            <Divider />
            <ListRow
              label="Appearance"
              icon="droplet"
              subtitle="Theme and accent"
              onPress={() => router.push('/settings/appearance')}
            />
            <Divider />
            <ListRow
              label="Data & backup"
              icon="download"
              subtitle="Export, delete account"
              onPress={() => router.push('/settings/data')}
            />
            <Divider />
            <ListRow label="About" icon="info" onPress={() => router.push('/settings/about')} />
          </View>
        </View>

        <View style={{ paddingTop: space.xl }}>
          <SectionHeader title="Reviews" />
          <View style={{ gap: space.sm }}>
            <Button
              label="Daily review"
              icon="edit-3"
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
        message="Your data stays safe in your account. You can sign back in any time."
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
  if (!name) return 'C';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}
