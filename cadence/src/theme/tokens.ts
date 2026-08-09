/**
 * DEVBEAST OS design tokens.
 *
 * Visual system: "Kinetic Performance Noir" — near-black layered surfaces,
 * one mutable electric accent, condensed uppercase display type, hairline
 * seams instead of floating shadows, brisk purposeful motion.
 *
 * Adaptations made for a touch-first mobile product:
 *  - a small (not zero) radius scale so controls stay comfortable to tap
 *  - a light palette that keeps the same structural language for daytime use
 */

export type AccentName = 'voltage' | 'cyan' | 'lime' | 'citrus' | 'ember';

export interface AccentFamily {
  /** Primary electric accent. */
  base: string;
  /** Light partner — used for text on accent-tinted surfaces. */
  soft: string;
  /** Deep partner — used for filled tints and track backgrounds. */
  deep: string;
  /** Text colour that sits legibly on a fully accent-filled control. */
  on: string;
}

export const ACCENTS: Record<AccentName, AccentFamily> = {
  voltage: { base: '#7C5CFF', soft: '#C9BCFF', deep: '#241A52', on: '#08060F' },
  cyan: { base: '#41CFFF', soft: '#9BE6FF', deep: '#0A3352', on: '#00131C' },
  lime: { base: '#8DF23F', soft: '#CEFF9B', deep: '#1D4A0C', on: '#08150A' },
  citrus: { base: '#D7F23F', soft: '#EEFF9B', deep: '#41480C', on: '#14140A' },
  ember: { base: '#FF7A45', soft: '#FFC2A8', deep: '#4A1D0C', on: '#170805' },
};

export const ACCENT_LABELS: Record<AccentName, string> = {
  voltage: 'Voltage',
  cyan: 'Electric Cyan',
  lime: 'Performance',
  citrus: 'Acid Citrus',
  ember: 'Ember',
};

/** Category accent swatches — used only to distinguish life areas. */
export const CATEGORY_COLORS = [
  '#7C5CFF', // violet
  '#41CFFF', // cyan
  '#8DF23F', // lime
  '#FF7A45', // ember
  '#FF5D8F', // magenta
  '#FFBF47', // amber
  '#4ADE9B', // mint
  '#9BA4FF', // periwinkle
  '#F2E85C', // acid
  '#5EEAD4', // teal
] as const;

export const SEMANTIC = {
  success: '#4ADE9B',
  warning: '#FFBF47',
  danger: '#FF5D6C',
  info: '#41CFFF',
} as const;

export interface Palette {
  /** Page canvas. */
  bg: string;
  /** Alternate section band / footer / modal ground. */
  surface1: string;
  /** Cards, forms, drawers. */
  surface2: string;
  /** Raised / pressed surface. */
  surface3: string;
  /** Inset media, avatars, progress tracks. */
  inset: string;
  /** Scrim behind overlays. */
  scrim: string;

  text: string;
  textStrong: string;
  /** Emphasised supporting text. */
  text80: string;
  /** Default body copy. */
  text60: string;
  /** Labels. */
  text50: string;
  /** Metadata — never essential instructions. */
  text40: string;
  /** Placeholders / tertiary. */
  text30: string;

  line: string;
  lineStrong: string;
  lineHover: string;
}

export const DARK_PALETTE: Palette = {
  bg: '#060607',
  surface1: '#0A0A0C',
  surface2: '#0D0D10',
  surface3: '#141418',
  inset: '#111114',
  scrim: 'rgba(0,0,0,0.72)',

  text: '#F4F2EC',
  textStrong: '#FFFFFF',
  text80: 'rgba(255,255,255,0.80)',
  text60: 'rgba(255,255,255,0.60)',
  text50: 'rgba(255,255,255,0.50)',
  text40: 'rgba(255,255,255,0.40)',
  text30: 'rgba(255,255,255,0.30)',

  line: 'rgba(255,255,255,0.10)',
  lineStrong: 'rgba(255,255,255,0.16)',
  lineHover: 'rgba(255,255,255,0.30)',
};

export const LIGHT_PALETTE: Palette = {
  bg: '#F6F6F4',
  surface1: '#FFFFFF',
  surface2: '#FFFFFF',
  surface3: '#EFEFEC',
  inset: '#E9E9E5',
  scrim: 'rgba(12,12,14,0.45)',

  text: '#131316',
  textStrong: '#000000',
  text80: 'rgba(10,10,12,0.82)',
  text60: 'rgba(10,10,12,0.62)',
  text50: 'rgba(10,10,12,0.52)',
  text40: 'rgba(10,10,12,0.42)',
  text30: 'rgba(10,10,12,0.30)',

  line: 'rgba(10,10,12,0.10)',
  lineStrong: 'rgba(10,10,12,0.16)',
  lineHover: 'rgba(10,10,12,0.32)',
};

/** 2, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96 */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  xxxl: 32,
  h1: 40,
  h2: 48,
  h3: 56,
  h4: 64,
  h5: 80,
  h6: 96,
} as const;

/**
 * The source system uses square corners. On touch UI a small radius keeps
 * controls comfortable without losing the crisp, technical character.
 */
export const radius = {
  none: 0,
  card: 6,
  control: 10,
  sheet: 18,
  pill: 999,
} as const;

export const font = {
  display: 'Oswald_600SemiBold',
  displayBold: 'Oswald_700Bold',
  displayMedium: 'Oswald_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  bodyBlack: 'Inter_800ExtraBold',
} as const;

export const type = {
  /** Oversized dashboard metric. */
  metricHero: { fontFamily: font.displayBold, fontSize: 64, lineHeight: 64, letterSpacing: 0.5 },
  metricLarge: { fontFamily: font.displayBold, fontSize: 40, lineHeight: 42, letterSpacing: 0.4 },
  metric: { fontFamily: font.display, fontSize: 28, lineHeight: 30, letterSpacing: 0.3 },
  metricSmall: { fontFamily: font.display, fontSize: 20, lineHeight: 22, letterSpacing: 0.3 },

  /** Screen title — uppercase, condensed. */
  displayLarge: { fontFamily: font.displayBold, fontSize: 34, lineHeight: 36, letterSpacing: 0.4 },
  display: { fontFamily: font.display, fontSize: 24, lineHeight: 27, letterSpacing: 0.3 },
  displaySmall: { fontFamily: font.display, fontSize: 18, lineHeight: 21, letterSpacing: 0.3 },

  /** Heavily tracked uppercase metadata. */
  eyebrow: { fontFamily: font.bodyBlack, fontSize: 10, lineHeight: 13, letterSpacing: 1.6 },
  eyebrowLarge: { fontFamily: font.bodyBlack, fontSize: 11, lineHeight: 14, letterSpacing: 2.0 },
  button: { fontFamily: font.bodyBlack, fontSize: 12, lineHeight: 15, letterSpacing: 1.3 },

  title: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 22 },
  titleLarge: { fontFamily: font.bodySemi, fontSize: 18, lineHeight: 25 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  bodySmall: { fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  label: { fontFamily: font.bodyMedium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.bodyMedium, fontSize: 11, lineHeight: 15 },
} as const;

export const motion = {
  fast: 180,
  base: 240,
  sheet: 300,
  overlay: 250,
  reveal: 420,
  accent: 500,
} as const;

/** Minimum accessible touch target. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
export const TOUCH_MIN = 44;

export const overlayShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.6,
  shadowRadius: 32,
  shadowOffset: { width: 0, height: 16 },
  elevation: 24,
};
