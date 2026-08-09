import Constants from 'expo-constants';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { Body, Caption, Eyebrow, MetricLarge } from '@/components/ui/Text';
import { PROJECT_ID, isFirebaseConfigured } from '@/services/firebase/config';
import { useTheme } from '@/theme/ThemeProvider';

const PRINCIPLES = [
  'Record something once — the score, streak, category split and weekly rollup all update from it.',
  'A number is never shown unless it comes from something you actually did.',
  'A flexible habit is not a failure on a day you chose not to do it.',
  'Rest days are a state, not a gap.',
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
              DEVBEAST OS
            </MetricLarge>
            <Eyebrow color={accent.base}>Run your life like a system</Eyebrow>
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
              Your records live under your own account and are readable only by you. Reminders are
              scheduled locally, so nothing about your day is sent to a notification server.
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
