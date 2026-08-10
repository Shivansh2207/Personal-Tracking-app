import Constants from 'expo-constants';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { Body, Caption, Eyebrow, MetricLarge } from '@/components/ui/Text';
import { APP_NAME, APP_TAGLINE } from '@/constants/app';
import { PROJECT_ID, isFirebaseConfigured } from '@/services/firebase/config';
import { useTheme } from '@/theme/ThemeProvider';

const PRINCIPLES = [
  'Set your structure once, then log what actually happened in seconds.',
  'Not everything is a task — a routine declares how it is measured and when it is owed.',
  'A flexible weekly target is never a miss on any single day.',
  '15 of 20 pages is 75%, not zero. Partial effort is recorded as partial.',
  'Rest days are a state, not a gap. Unscheduled days are never failures.',
  'Time spent never marks a chapter complete — you confirm progress.',
];

export default function About() {
  const { c, space, accent, radius } = useTheme();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen>
      <AppHeader title="About" eyebrow="Settings" showBack />
      <ScreenScroll>
        <View style={{ gap: space.xl, paddingTop: space.lg }}>
          <View style={{ gap: space.sm }}>
            <MetricLarge tone="strong" style={{ letterSpacing: 2 }}>
              {APP_NAME.toUpperCase()}
            </MetricLarge>
            <Eyebrow color={accent.base}>{APP_TAGLINE}</Eyebrow>
            <Caption tone="faint">Version {version}</Caption>
          </View>

          <View>
            <SectionHeader title="How it works" />
            <View style={{ gap: space.md }}>
              {PRINCIPLES.map((line, index) => (
                <View key={line} style={{ flexDirection: 'row', gap: space.md }}>
                  <Eyebrow color={accent.base}>{String(index + 1).padStart(2, '0')}</Eyebrow>
                  <Body tone="muted" style={{ flex: 1, fontSize: 14 }}>
                    {line}
                  </Body>
                </View>
              ))}
            </View>
          </View>

          <View>
            <SectionHeader title="Storage" />
            <View
              style={{
                padding: space.base,
                gap: space.sm,
                backgroundColor: c.surface2,
                borderRadius: radius.card,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
              }}>
              <Row label="Backend" value="Cloud Firestore" />
              <Row label="Project" value={PROJECT_ID || '—'} />
              <Row label="Configured" value={isFirebaseConfigured ? 'Yes' : 'No'} />
              <Row label="Reminders" value="On-device only" />
            </View>
            <Caption tone="faint" style={{ paddingTop: space.sm }}>
              Your records live under your own account and are readable only by you.
            </Caption>
          </View>
        </View>
      </ScreenScroll>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Eyebrow tone="faint" style={{ flex: 1 }}>
        {label}
      </Eyebrow>
      <Caption tone="default">{value}</Caption>
    </View>
  );
}
