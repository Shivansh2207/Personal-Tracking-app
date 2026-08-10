import React from 'react';
import { StyleProp, Text as RNText, TextProps, TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

type Tone = 'default' | 'strong' | 'muted' | 'meta' | 'faint' | 'accent' | 'inverse';

interface BaseProps extends TextProps {
  tone?: Tone;
  color?: string;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

function useTone(tone: Tone | undefined, color?: string): string {
  const { c, accent } = useTheme();
  if (color) return color;
  switch (tone) {
    case 'strong':
      return c.textStrong;
    case 'muted':
      return c.text60;
    case 'meta':
      return c.text50;
    case 'faint':
      return c.text40;
    case 'accent':
      return accent.base;
    case 'inverse':
      return accent.on;
    default:
      return c.text;
  }
}

function make(variant: keyof ReturnType<typeof useTheme>['type'], transform?: 'uppercase') {
  return function Variant({ tone, color, align, style, children, ...rest }: BaseProps) {
    const { type } = useTheme();
    const resolved = useTone(tone, color);
    return (
      <RNText
        {...rest}
        style={[
          type[variant] as TextStyle,
          { color: resolved, textAlign: align },
          transform ? { textTransform: transform } : null,
          style,
        ]}>
        {children}
      </RNText>
    );
  };
}

/** Condensed uppercase display type — short headlines and metrics only. */
export const DisplayLarge = make('displayLarge', 'uppercase');
export const Display = make('display', 'uppercase');
export const DisplaySmall = make('displaySmall', 'uppercase');

export const MetricHero = make('metricHero');
export const MetricLarge = make('metricLarge');
export const Metric = make('metric');
export const MetricSmall = make('metricSmall');

/** Heavily tracked uppercase metadata. */
export const Eyebrow = make('eyebrow', 'uppercase');
export const EyebrowLarge = make('eyebrowLarge', 'uppercase');
export const ButtonLabel = make('button', 'uppercase');

export const Title = make('title');
export const TitleLarge = make('titleLarge');
export const Body = make('body');
export const BodySmall = make('bodySmall');
export const Label = make('label');
export const Caption = make('caption');

export { RNText as RawText };
