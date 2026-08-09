import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SegmentedControl } from '@/components/ui/Controls';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { Body, Caption, Eyebrow, MetricSmall } from '@/components/ui/Text';
import { useTheme, ThemeMode } from '@/theme/ThemeProvider';
import { ACCENTS, ACCENT_LABELS, AccentName } from '@/theme/tokens';

export default function Appearance() {
  const { c, space, radius, mode, setMode, accentName, setAccent, accent } = useTheme();

  return (
    <Screen>
      <AppHeader title="Appearance" eyebrow="Settings" showBack />
      <ScreenScroll>
        <View style={{ gap: space.xl, paddingTop: space.sm }}>
          <View style={{ gap: space.sm }}>
            <SectionHeader title="Theme" />
            <SegmentedControl
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' },
              ]}
              value={mode}
              onChange={(v) => setMode(v as ThemeMode)}
            />
            <Caption tone="faint">
              DEVBEAST OS is designed dark-first. The light theme keeps the same structure with a paper
              ground.
            </Caption>
          </View>

          <View style={{ gap: space.md }}>
            <SectionHeader title="Accent" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {(Object.keys(ACCENTS) as AccentName[]).map((name) => {
                const family = ACCENTS[name];
                const selected = accentName === name;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={ACCENT_LABELS[name]}
                    onPress={() => setAccent(name)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.sm,
                      paddingVertical: space.sm,
                      paddingHorizontal: space.md,
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: selected ? family.base : c.line,
                      backgroundColor: selected ? c.surface3 : 'transparent',
                    }}>
                    <View style={{ width: 16, height: 16, backgroundColor: family.base }} />
                    <Caption tone={selected ? 'default' : 'meta'}>{ACCENT_LABELS[name]}</Caption>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <SectionHeader title="Preview" />
            <View
              style={{
                padding: space.base,
                gap: space.md,
                backgroundColor: c.surface2,
                borderRadius: radius.card,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
              }}>
              <Eyebrow color={accent.base}>Today</Eyebrow>
              <MetricSmall tone="strong" style={{ fontSize: 44, lineHeight: 46 }}>
                72%
              </MetricSmall>
              <View style={{ height: 6, backgroundColor: c.inset }}>
                <View style={{ width: '72%', height: 6, backgroundColor: accent.base }} />
              </View>
              <Body tone="muted" style={{ fontSize: 13 }}>
                7 / 10 tasks · 5 / 7 habits · 2h 45m focused
              </Body>
            </View>
          </View>
        </View>
      </ScreenScroll>
    </Screen>
  );
}
