import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH_MIN } from '@/theme/tokens';
import type { DateKey, TimeString } from '@/types/models';
import {
  addDays,
  formatDuration,
  formatRelativeDate,
  formatTime,
  minutesToTime,
  nextWeekKey,
  nextWeekendKey,
  startOfMonth,
  timeToMinutes,
  todayKey,
} from '@/utils/date';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Calendar } from './Calendar';
import { Chip, ChipGroup, TextField } from './Controls';
import { Icon } from './Icon';
import { Body, Caption, Eyebrow, Title } from './Text';

interface TriggerProps {
  label: string;
  value: string;
  placeholder?: string;
  onPress: () => void;
  onClear?: () => void;
  icon?: React.ComponentProps<typeof Icon>['name'];
}

function FieldTrigger({ label, value, placeholder, onPress, onClear, icon }: TriggerProps) {
  const { c, radius, space, accent } = useTheme();
  const filled = Boolean(value);
  return (
    <View style={{ gap: space.sm, flex: 1 }}>
      <Eyebrow tone="meta">{label}</Eyebrow>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder || 'not set'}`}
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          minHeight: TOUCH_MIN + 4,
          paddingHorizontal: space.md,
          backgroundColor: pressed ? c.surface3 : c.surface2,
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.line,
        })}>
        {icon ? <Icon name={icon} size={16} color={filled ? accent.base : c.text40} /> : null}
        <Body tone={filled ? 'default' : 'faint'} style={{ flex: 1 }} numberOfLines={1}>
          {value || placeholder || 'Not set'}
        </Body>
        {filled && onClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            hitSlop={10}
            onPress={onClear}>
            <Icon name="x" size={15} color={c.text40} />
          </Pressable>
        ) : (
          <Icon name="chevron-down" size={15} color={c.text30} />
        )}
      </Pressable>
    </View>
  );
}

interface DateFieldProps {
  label?: string;
  value: DateKey | null;
  onChange: (value: DateKey | null) => void;
  allowClear?: boolean;
  minDate?: DateKey;
  weekStart?: 0 | 1;
  clearLabel?: string;
}

/** Date picker with the natural-language shortcuts the brief calls for. */
export function DateField({
  label = 'Date',
  value,
  onChange,
  allowClear = true,
  minDate,
  weekStart = 1,
  clearLabel = 'No date (backlog)',
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<DateKey>(startOfMonth(value ?? todayKey()));
  const { space } = useTheme();
  const today = todayKey();

  const shortcuts: { label: string; date: DateKey }[] = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'This weekend', date: nextWeekendKey(today) },
    { label: 'Next week', date: nextWeekKey(today, weekStart) },
  ];

  return (
    <>
      <FieldTrigger
        label={label}
        icon="calendar"
        value={value ? formatRelativeDate(value) : ''}
        placeholder={clearLabel}
        onPress={() => {
          setMonth(startOfMonth(value ?? today));
          setOpen(true);
        }}
        onClear={allowClear ? () => onChange(null) : undefined}
      />
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Pick a date" eyebrow="Schedule">
        <ChipGroup style={{ paddingBottom: space.base }}>
          {shortcuts.map((s) => (
            <Chip
              key={s.label}
              label={s.label}
              selected={value === s.date}
              onPress={() => {
                onChange(s.date);
                setOpen(false);
              }}
            />
          ))}
          {allowClear ? (
            <Chip
              label={clearLabel}
              selected={value === null}
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
            />
          ) : null}
        </ChipGroup>
        <Calendar
          month={month}
          onMonthChange={setMonth}
          selected={value}
          minDate={minDate}
          weekStart={weekStart}
          onSelectDate={(date) => {
            onChange(date);
            setOpen(false);
          }}
        />
      </BottomSheet>
    </>
  );
}

interface TimeFieldProps {
  label?: string;
  value: TimeString | null;
  onChange: (value: TimeString | null) => void;
  use24Hour?: boolean;
  allowClear?: boolean;
}

const TIME_PRESETS: { label: string; time: TimeString }[] = [
  { label: 'Morning', time: '08:00' },
  { label: 'Midday', time: '12:00' },
  { label: 'Afternoon', time: '15:00' },
  { label: 'Evening', time: '19:00' },
];

export function TimeField({
  label = 'Time',
  value,
  onChange,
  use24Hour = false,
  allowClear = true,
}: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  const { space, c } = useTheme();

  // 15-minute increments from 05:00 to 23:45 covers real planning without a
  // fiddly wheel picker.
  const slots: TimeString[] = [];
  for (let m = 5 * 60; m <= 23 * 60 + 45; m += 15) slots.push(minutesToTime(m));

  return (
    <>
      <FieldTrigger
        label={label}
        icon="clock"
        value={value ? formatTime(value, use24Hour) : ''}
        placeholder="Any time"
        onPress={() => setOpen(true)}
        onClear={allowClear ? () => onChange(null) : undefined}
      />
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Pick a time" eyebrow="Schedule">
        <ChipGroup style={{ paddingBottom: space.base }}>
          {TIME_PRESETS.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              selected={value === p.time}
              onPress={() => {
                onChange(p.time);
                setOpen(false);
              }}
            />
          ))}
          {allowClear ? (
            <Chip
              label="Any time"
              selected={value === null}
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
            />
          ) : null}
        </ChipGroup>
        <View style={{ maxHeight: 320 }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {slots.map((slot) => {
                const selected = slot === value;
                return (
                  <Pressable
                    key={slot}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={formatTime(slot, use24Hour)}
                    onPress={() => {
                      onChange(slot);
                      setOpen(false);
                    }}
                    style={{
                      width: '31%',
                      minHeight: TOUCH_MIN,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: selected ? c.lineHover : c.line,
                      backgroundColor: selected ? c.surface3 : 'transparent',
                    }}>
                    <Caption tone={selected ? 'default' : 'meta'}>
                      {formatTime(slot, use24Hour)}
                    </Caption>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </BottomSheet>
    </>
  );
}

interface DurationFieldProps {
  label?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  presets?: number[];
  allowClear?: boolean;
}

export function DurationField({
  label = 'Duration',
  value,
  onChange,
  presets = [15, 25, 30, 45, 60, 90, 120],
  allowClear = true,
}: DurationFieldProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const { space } = useTheme();

  return (
    <>
      <FieldTrigger
        label={label}
        icon="clock"
        value={value ? formatDuration(value) : ''}
        placeholder="Not set"
        onPress={() => {
          setCustom(value ? String(value) : '');
          setOpen(true);
        }}
        onClear={allowClear ? () => onChange(null) : undefined}
      />
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Duration"
        eyebrow="Minutes"
        footer={
          <Button
            label="Save"
            full
            onPress={() => {
              const parsed = Number(custom);
              onChange(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null);
              setOpen(false);
            }}
          />
        }>
        <ChipGroup style={{ paddingBottom: space.base }}>
          {presets.map((p) => (
            <Chip
              key={p}
              label={formatDuration(p)}
              selected={value === p}
              onPress={() => {
                onChange(p);
                setOpen(false);
              }}
            />
          ))}
        </ChipGroup>
        <TextField
          label="Custom"
          value={custom}
          onChangeText={setCustom}
          keyboardType="number-pad"
          placeholder="e.g. 40"
          hint="Minutes"
        />
      </BottomSheet>
    </>
  );
}

/** Compact stepper for numeric settings such as the focus goal. */
export function NumberStepper({
  label,
  value,
  onChange,
  step = 15,
  min = 0,
  max = 600,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const { c, space, radius } = useTheme();
  const button = (icon: 'minus' | 'plus', delta: number, hint: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      onPress={() => onChange(Math.max(min, Math.min(max, value + delta)))}
      style={({ pressed }) => ({
        width: TOUCH_MIN,
        height: TOUCH_MIN,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.surface3 : 'transparent',
      })}>
      <Icon name={icon} size={16} color={c.text60} />
    </Pressable>
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.sm,
      }}>
      <Title style={{ flex: 1 }}>{label}</Title>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.line,
          borderRadius: radius.control,
          overflow: 'hidden',
        }}>
        {button('minus', -step, `Decrease ${label}`)}
        <View style={{ minWidth: 64, alignItems: 'center' }}>
          <Body>
            {value}
            {suffix ? ` ${suffix}` : ''}
          </Body>
        </View>
        {button('plus', step, `Increase ${label}`)}
      </View>
    </View>
  );
}

export { timeToMinutes };
