import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import { Body, Caption, Eyebrow, MetricSmall } from '@/components/ui/Text';

/**
 * Charts are drawn with plain SVG so they inherit the theme exactly and stay
 * dependency-free. Every chart renders only real values; a series with no data
 * renders an explicit empty state rather than a flat placeholder line.
 */

export interface SeriesPoint {
  label: string;
  value: number;
  hasData?: boolean;
  key?: string;
}

const CHART_PAD = { left: 30, right: 8, top: 12, bottom: 22 };

interface LineChartProps {
  data: SeriesPoint[];
  height?: number;
  max?: number;
  color?: string;
  suffix?: string;
  /** Show at most this many x labels to avoid crowding. */
  maxLabels?: number;
}

export function LineChart({
  data,
  height = 180,
  max = 100,
  color,
  suffix = '%',
  maxLabels = 6,
}: LineChartProps) {
  const { c, accent, space } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [width, setWidth] = useState(screenWidth - 64);
  const [active, setActive] = useState<number | null>(null);
  const tint = color ?? accent.base;

  const plotW = Math.max(1, width - CHART_PAD.left - CHART_PAD.right);
  const plotH = Math.max(1, height - CHART_PAD.top - CHART_PAD.bottom);

  const points = useMemo(() => {
    if (data.length === 0) return [];
    const step = data.length === 1 ? 0 : plotW / (data.length - 1);
    return data.map((d, i) => ({
      ...d,
      x: CHART_PAD.left + i * step,
      y: CHART_PAD.top + plotH - (Math.max(0, Math.min(max, d.value)) / max) * plotH,
    }));
  }, [data, plotW, plotH, max]);

  const path = useMemo(() => {
    if (points.length === 0) return '';
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length < 2) return '';
    const base = CHART_PAD.top + plotH;
    return `${path} L${points[points.length - 1].x.toFixed(1)},${base} L${points[0].x.toFixed(1)},${base} Z`;
  }, [path, points, plotH]);

  const labelStride = Math.max(1, Math.ceil(data.length / maxLabels));
  const gridValues = [0, max / 2, max];
  const activePoint = active !== null ? points[active] : null;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible={false}>
      <View style={{ height, position: 'relative' }}>
        <Svg width={width} height={height}>
          {gridValues.map((value) => {
            const y = CHART_PAD.top + plotH - (value / max) * plotH;
            return (
              <Line
                key={value}
                x1={CHART_PAD.left}
                x2={width - CHART_PAD.right}
                y1={y}
                y2={y}
                stroke={c.line}
                strokeWidth={StyleSheet.hairlineWidth * 2}
              />
            );
          })}
          {areaPath ? <Path d={areaPath} fill={withAlpha(tint, 0.12)} /> : null}
          {path ? (
            <Path d={path} stroke={tint} strokeWidth={2} fill="none" strokeLinejoin="round" />
          ) : null}
          {points.map((p, i) => (
            <Circle
              key={`${p.label}-${i}`}
              cx={p.x}
              cy={p.y}
              r={active === i ? 4.5 : p.hasData === false ? 0 : 2.5}
              fill={active === i ? tint : c.bg}
              stroke={tint}
              strokeWidth={1.5}
            />
          ))}
          {activePoint ? (
            <Line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={CHART_PAD.top}
              y2={CHART_PAD.top + plotH}
              stroke={withAlpha(tint, 0.4)}
              strokeWidth={1}
            />
          ) : null}
        </Svg>

        {/* Axis labels */}
        <View style={{ position: 'absolute', left: 0, top: 0, height, justifyContent: 'space-between', paddingVertical: CHART_PAD.top - 6 }}>
          {[max, max / 2, 0].map((v) => (
            <Caption key={v} tone="faint">
              {Math.round(v)}
            </Caption>
          ))}
        </View>

        {/* Touch targets */}
        <View style={{ position: 'absolute', left: CHART_PAD.left, right: CHART_PAD.right, top: 0, bottom: CHART_PAD.bottom, flexDirection: 'row' }}>
          {data.map((d, i) => (
            <Pressable
              key={`${d.label}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}: ${Math.round(d.value)}${suffix}`}
              style={{ flex: 1 }}
              onPress={() => setActive(active === i ? null : i)}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', paddingLeft: CHART_PAD.left, paddingRight: CHART_PAD.right }}>
        {data.map((d, i) => (
          <View key={`${d.label}-x-${i}`} style={{ flex: 1, alignItems: 'center' }}>
            {i % labelStride === 0 ? <Caption tone="faint">{d.label}</Caption> : null}
          </View>
        ))}
      </View>

      {activePoint ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, paddingTop: space.sm }}>
          <MetricSmall color={tint}>
            {Math.round(activePoint.value)}
            {suffix}
          </MetricSmall>
          <Caption tone="meta">{activePoint.label}</Caption>
        </View>
      ) : null}
    </View>
  );
}

interface BarChartProps {
  data: SeriesPoint[];
  height?: number;
  max?: number;
  color?: string;
  suffix?: string;
  highlightIndex?: number | null;
  showValues?: boolean;
}

export function BarChart({
  data,
  height = 160,
  max,
  color,
  suffix = '%',
  highlightIndex = null,
  showValues = true,
}: BarChartProps) {
  const { c, accent, space } = useTheme();
  const tint = color ?? accent.base;
  const ceiling = max ?? Math.max(100, ...data.map((d) => d.value));

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 6 }}>
        {data.map((d, i) => {
          const ratio = ceiling > 0 ? Math.max(0, Math.min(1, d.value / ceiling)) : 0;
          const isHighlight = highlightIndex === i;
          return (
            <View
              key={`${d.label}-${i}`}
              accessible
              accessibilityLabel={`${d.label}: ${Math.round(d.value)}${suffix}`}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
              {showValues ? (
                <Caption tone={d.hasData === false ? 'faint' : 'meta'}>
                  {d.hasData === false ? '—' : Math.round(d.value)}
                </Caption>
              ) : null}
              <View
                style={{
                  width: '100%',
                  height: Math.max(2, ratio * (height - 34)),
                  backgroundColor:
                    d.hasData === false
                      ? c.inset
                      : isHighlight
                        ? tint
                        : withAlpha(tint, 0.45),
                  borderTopWidth: isHighlight ? 2 : 0,
                  borderTopColor: tint,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {data.map((d, i) => (
          <View key={`${d.label}-label-${i}`} style={{ flex: 1, alignItems: 'center' }}>
            <Caption tone={highlightIndex === i ? 'default' : 'faint'}>{d.label}</Caption>
          </View>
        ))}
      </View>
    </View>
  );
}

export interface DistributionItem {
  label: string;
  value: number;
  percent: number;
  color: string;
  formattedValue?: string;
}

/**
 * Category split, drawn as a single stacked meter plus a labelled list. A
 * stacked bar reads far better than a pie on a phone and keeps the labels
 * legible with many categories.
 */
export function DistributionChart({ items }: { items: DistributionItem[] }) {
  const { space, c } = useTheme();
  if (items.length === 0) return null;

  return (
    <View style={{ gap: space.base }}>
      <View
        accessible
        accessibilityLabel={items.map((i) => `${i.label} ${i.percent} percent`).join(', ')}
        style={{ flexDirection: 'row', height: 10, gap: 2, overflow: 'hidden' }}>
        {items.map((item) => (
          <View
            key={item.label}
            style={{ flex: Math.max(0.02, item.percent), backgroundColor: item.color }}
          />
        ))}
      </View>
      <View style={{ gap: space.sm }}>
        {items.map((item) => (
          <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ width: 8, height: 8, backgroundColor: item.color }} />
            <Body style={{ flex: 1 }} numberOfLines={1}>
              {item.label}
            </Body>
            {item.formattedValue ? <Caption tone="faint">{item.formattedValue}</Caption> : null}
            <MetricSmall tone="strong" style={{ minWidth: 46, textAlign: 'right' }}>
              {item.percent}%
            </MetricSmall>
          </View>
        ))}
      </View>
      <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }} />
    </View>
  );
}

export interface HeatmapCell {
  date: string;
  level: 0 | 1 | 2 | 3 | 4;
}

/** GitHub-style consistency grid: weeks as columns, weekdays as rows. */
export function Heatmap({
  cells,
  colors,
  onSelect,
  weekStartLabels = ['M', '', 'W', '', 'F', '', 'S'],
  cellSize = 11,
  gap = 3,
}: {
  cells: HeatmapCell[];
  colors: string[];
  onSelect?: (date: string) => void;
  weekStartLabels?: string[];
  cellSize?: number;
  gap?: number;
}) {
  const { space } = useTheme();
  const weeks: HeatmapCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <View style={{ gap, paddingTop: 1 }}>
        {weekStartLabels.map((label, i) => (
          <View key={i} style={{ height: cellSize, justifyContent: 'center' }}>
            <Caption tone="faint" style={{ fontSize: 9, lineHeight: 10 }}>
              {label}
            </Caption>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ gap }}>
            {week.map((cell) => (
              <Pressable
                key={cell.date}
                accessibilityRole="button"
                accessibilityLabel={cell.date}
                disabled={!onSelect}
                onPress={() => onSelect?.(cell.date)}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: colors[cell.level],
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Horizontal ranked bars — used for habit consistency and subject minutes. */
export function RankedBars({
  items,
  suffix = '%',
  max,
}: {
  items: { label: string; value: number; color?: string; caption?: string }[];
  suffix?: string;
  max?: number;
}) {
  const { c, accent, space } = useTheme();
  const ceiling = max ?? Math.max(1, ...items.map((i) => i.value));

  return (
    <View style={{ gap: space.md }}>
      {items.map((item) => (
        <View key={item.label} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
            <Body style={{ flex: 1 }} numberOfLines={1}>
              {item.label}
            </Body>
            {item.caption ? <Caption tone="faint">{item.caption}</Caption> : null}
            <MetricSmall tone="strong">
              {Math.round(item.value)}
              {suffix}
            </MetricSmall>
          </View>
          <View style={{ height: 6, backgroundColor: c.inset }}>
            <View
              style={{
                width: `${Math.max(0, Math.min(100, (item.value / ceiling) * 100))}%`,
                height: 6,
                backgroundColor: item.color ?? accent.base,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ChartEmpty({ message }: { message: string }) {
  const { space, c, radius } = useTheme();
  return (
    <View
      style={{
        paddingVertical: space.xxl,
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderStyle: 'dashed',
        borderColor: c.line,
        borderRadius: radius.card,
      }}>
      <Eyebrow tone="faint">Not enough data</Eyebrow>
      <Body tone="faint" align="center" style={{ paddingTop: 6, maxWidth: 260 }}>
        {message}
      </Body>
    </View>
  );
}

/** Renders a Svg-free spark line for compact rows. */
export function Sparkline({
  values,
  width = 72,
  height = 22,
  color,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const { accent, c } = useTheme();
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(' ');
  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill={c.inset} opacity={0.4} />
      <Path d={d} stroke={color ?? accent.base} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}
