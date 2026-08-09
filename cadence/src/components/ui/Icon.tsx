import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import { StyleProp, TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export type IconName = React.ComponentProps<typeof Feather>['name'];

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 18, color, style }: Props) {
  const { c } = useTheme();
  return <Feather name={name} size={size} color={color ?? c.text60} style={style} />;
}

/**
 * Icon names stored on categories/habits are free-form strings, so they are
 * mapped to a known glyph here rather than trusted directly.
 */
const ICON_ALIASES: Record<string, IconName> = {
  book: 'book',
  'book-open': 'book-open',
  school: 'award',
  briefcase: 'briefcase',
  layers: 'layers',
  activity: 'activity',
  heart: 'heart',
  zap: 'zap',
  'trending-up': 'trending-up',
  target: 'target',
  droplet: 'droplet',
  moon: 'moon',
  sun: 'sun',
  check: 'check',
  circle: 'circle',
  code: 'code',
  camera: 'camera',
  music: 'music',
  coffee: 'coffee',
  wind: 'wind',
  footprints: 'navigation',
  bike: 'navigation-2',
  dollar: 'dollar-sign',
  home: 'home',
  users: 'users',
  edit: 'edit-3',
  star: 'star',
  flag: 'flag',
  shield: 'shield',
  cpu: 'cpu',
  globe: 'globe',
  smile: 'smile',
};

export function resolveIcon(name: string | null | undefined, fallback: IconName = 'circle'): IconName {
  if (!name) return fallback;
  return ICON_ALIASES[name] ?? (name as IconName);
}

/** The palette offered by the icon pickers. */
export const PICKABLE_ICONS: string[] = [
  'book',
  'book-open',
  'briefcase',
  'layers',
  'activity',
  'heart',
  'zap',
  'trending-up',
  'target',
  'droplet',
  'moon',
  'sun',
  'code',
  'camera',
  'music',
  'coffee',
  'dollar',
  'home',
  'users',
  'star',
  'flag',
  'shield',
  'cpu',
  'globe',
  'smile',
  'award',
];
