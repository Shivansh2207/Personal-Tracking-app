import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Eyebrow, MetricLarge } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Splash / bootstrap screen. The root layout redirects away from here as soon
 * as Firebase reports the restored auth state, so a returning user never sees
 * the login screen flash past.
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
          DEVBEAST OS
        </MetricLarge>
        <Eyebrow tone="faint">Run your life like a system</Eyebrow>
      </View>
      <ActivityIndicator color={accent.base} />
    </View>
  );
}
