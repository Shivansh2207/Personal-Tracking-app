import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon, IconName } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Layout';
import { Body, Caption, Eyebrow, MetricHero } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

const PILLARS: { icon: IconName; label: string; copy: string }[] = [
  { icon: 'check-square', label: 'Execute', copy: 'Tasks, habits and routines in one plan.' },
  { icon: 'clock', label: 'Focus', copy: 'Time your study and deep work sessions.' },
  { icon: 'bar-chart-2', label: 'Analyse', copy: 'See where your effort actually goes.' },
];

export default function Welcome() {
  const { c, space, accent } = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <View style={{ flex: 1, paddingHorizontal: 16, justifyContent: 'space-between' }}>
        <View style={{ paddingTop: space.h2, gap: space.md }}>
          <Eyebrow color={accent.base}>DEVBEAST OS</Eyebrow>
          <MetricHero tone="strong" style={{ fontSize: 56, lineHeight: 54 }}>
            RUN YOUR{'\n'}LIFE LIKE{'\n'}A SYSTEM
          </MetricHero>
          <Body tone="muted" style={{ maxWidth: 320 }}>
            One place for study, work, training and the habits that hold it all together — with the
            numbers to prove it is working.
          </Body>
        </View>

        <View style={{ gap: space.base }}>
          {PILLARS.map((pillar, index) => (
            <View
              key={pillar.label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.base,
                paddingVertical: space.md,
                borderTopWidth: StyleSheet.hairlineWidth * 2,
                borderTopColor: c.line,
              }}>
              <Eyebrow color={accent.base}>{String(index + 1).padStart(2, '0')}</Eyebrow>
              <Icon name={pillar.icon} size={18} color={c.text60} />
              <View style={{ flex: 1 }}>
                <Caption tone="default" style={{ fontSize: 14 }}>
                  {pillar.label}
                </Caption>
                <Caption tone="faint">{pillar.copy}</Caption>
              </View>
            </View>
          ))}
        </View>

        <View style={{ gap: space.md, paddingBottom: space.h2 }}>
          <Button
            label="Create your system"
            full
            size="lg"
            iconRight="arrow-right"
            onPress={() => router.push('/(auth)/sign-up')}
          />
          <Button
            label="I already have an account"
            variant="ghost"
            full
            onPress={() => router.push('/(auth)/sign-in')}
          />
        </View>
      </View>
    </Screen>
  );
}
