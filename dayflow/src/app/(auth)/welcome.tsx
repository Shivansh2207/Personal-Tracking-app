import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { APP_NAME } from '@/constants/app';
import { Button } from '@/components/ui/Button';
import { Icon, IconName } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Layout';
import { Body, Caption, Eyebrow, MetricHero } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

const PILLARS: { icon: IconName; label: string; copy: string }[] = [
  { icon: 'sunrise', label: 'Set it up once', copy: 'Routines, timetable and targets.' },
  { icon: 'check-circle', label: 'Log in seconds', copy: 'One tap, a count, or a timer.' },
  { icon: 'trending-up', label: 'See what works', copy: 'Real numbers from what you did.' },
];

export default function Welcome() {
  const { c, space, accent } = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <View style={{ flex: 1, paddingHorizontal: 16, justifyContent: 'space-between' }}>
        <View style={{ paddingTop: space.h2, gap: space.md }}>
          <Eyebrow color={accent.base}>{APP_NAME}</Eyebrow>
          <MetricHero tone="strong" style={{ fontSize: 54, lineHeight: 52 }}>
            BUILD A DAY{'\n'}THAT RUNS{'\n'}ITSELF
          </MetricHero>
          <Body tone="muted" style={{ maxWidth: 330 }}>
            Plan your routines, study timetable and responsibilities once. {APP_NAME} prepares each
            day for you and tracks how consistently you follow it.
          </Body>
        </View>

        <View>
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
            label="Get started"
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
