import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { APP_NAME, APP_TAGLINE } from '@/constants/app';
import { Eyebrow, MetricLarge } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Splash / bootstrap. The root layout redirects away as soon as Firebase
 * reports the restored auth state, so a returning user never sees the login
 * screen flash past.
 */
export default function Bootstrap() {
  const { c, accent, space } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.lg,
      }}>
      <View style={{ alignItems: 'center', gap: space.xs }}>
        <MetricLarge tone="strong" style={{ letterSpacing: 2 }}>
          {APP_NAME.toUpperCase()}
        </MetricLarge>
        <Eyebrow tone="faint">{APP_TAGLINE}</Eyebrow>
      </View>
      <ActivityIndicator color={accent.base} />
    </View>
  );
}
