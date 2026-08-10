import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { TextField, ToggleRow } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { Icon, PICKABLE_ICONS, resolveIcon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/States';
import { Body, Caption, Eyebrow } from '@/components/ui/Text';
import {
  CategoryUsage,
  createCategory,
  deleteCategory,
  getCategoryUsage,
  updateCategory,
} from '@/services/categoryService';
import { toFriendlyError } from '@/services/firebase/errors';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import { CATEGORY_COLORS } from '@/theme/tokens';
import type { Category } from '@/types/models';

export default function Categories() {
  const { c, space, accent, radius } = useTheme();
  const toast = useToast();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);

  const [editing, setEditing] = useState<Category | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('star');
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [deleting, setDeleting] = useState<{ category: Category; usage: CategoryUsage } | null>(
    null,
  );

  const openCreate = () => {
    setName('');
    setIcon('star');
    setColor(CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]);
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (category: Category) => {
    setName(category.name);
    setIcon(category.icon);
    setColor(category.color);
    setEditing(category);
    setSheetOpen(true);
  };

  const save = async () => {
    if (!uid || !name.trim()) return;
    try {
      if (editing) {
        await updateCategory(uid, editing.id, { name: name.trim(), icon, color });
        toast.show('Category updated.');
      } else {
        await createCategory(uid, { name, icon, color, order: categories.length });
        toast.show('Category created.');
      }
      setSheetOpen(false);
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save the category').message, 'error');
    }
  };

  return (
    <Screen>
      <AppHeader
        title="Categories"
        eyebrow="Settings"
        showBack
        right={<IconButton icon="plus" label="Add category" onPress={openCreate} size={40} />}
      />
      <ScreenScroll>
        {categories.length === 0 ? (
          <EmptyState
            icon="grid"
            title="No categories"
            message="Categories are the life areas your analytics split by."
            actionLabel="Add category"
            onAction={openCreate}
          />
        ) : (
          <View style={{ gap: space.sm, paddingTop: space.sm }}>
            {categories.map((category) => (
              <View
                key={category.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  padding: space.md,
                  backgroundColor: c.surface2,
                  borderRadius: radius.card,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                  opacity: category.active ? 1 : 0.5,
                }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: c.inset,
                  }}>
                  <Icon name={resolveIcon(category.icon)} size={16} color={category.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Body numberOfLines={1}>{category.name}</Body>
                  <Caption tone="faint">{category.active ? 'Active' : 'Inactive'}</Caption>
                </View>
                <IconButton
                  icon="edit-3"
                  label={`Edit ${category.name}`}
                  size={38}
                  bordered={false}
                  onPress={() => openEdit(category)}
                />
                <IconButton
                  icon="trash-2"
                  label={`Delete ${category.name}`}
                  size={38}
                  bordered={false}
                  onPress={async () => {
                    if (!uid) return;
                    const usage = await getCategoryUsage(uid, category.id).catch(() => ({
                      routines: 0,
                      tasks: 0,
                      total: 0,
                    }));
                    setDeleting({ category, usage });
                  }}
                />
              </View>
            ))}
          </View>
        )}
      </ScreenScroll>

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? 'Edit category' : 'New category'}
        eyebrow="Life area"
        footer={<Button label="Save" full onPress={save} disabled={!name.trim()} />}>
        <View style={{ gap: space.lg, paddingBottom: space.base }}>
          <TextField label="Name" value={name} onChangeText={setName} placeholder="Side project" />

          <View style={{ gap: space.sm }}>
            <Eyebrow tone="meta">Colour</Eyebrow>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {CATEGORY_COLORS.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={`Colour ${option}`}
                  accessibilityState={{ selected: color === option }}
                  onPress={() => setColor(option)}
                  style={{
                    width: 36,
                    height: 36,
                    backgroundColor: option,
                    borderWidth: color === option ? 3 : 0,
                    borderColor: c.textStrong,
                  }}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: space.sm }}>
            <Eyebrow tone="meta">Icon</Eyebrow>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {PICKABLE_ICONS.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={`Icon ${option}`}
                  accessibilityState={{ selected: icon === option }}
                  onPress={() => setIcon(option)}
                  style={{
                    width: 40,
                    height: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: icon === option ? accent.base : c.line,
                  }}>
                  <Icon
                    name={resolveIcon(option)}
                    size={16}
                    color={icon === option ? accent.base : c.text50}
                  />
                </Pressable>
              ))}
            </View>
          </View>

          {editing ? (
            <ToggleRow
              label="Active"
              subtitle="Inactive categories stay in history but are hidden when picking"
              value={editing.active}
              onChange={async (value) => {
                if (!uid) return;
                await updateCategory(uid, editing.id, { active: value });
                setEditing({ ...editing, active: value });
              }}
            />
          ) : null}
        </View>
      </BottomSheet>

      <ConfirmationDialog
        visible={!!deleting}
        title={`Delete ${deleting?.category.name}?`}
        message={
          deleting && deleting.usage.total > 0
            ? `${deleting.usage.routines} routine(s) and ${deleting.usage.tasks} task(s) use this category. Deleting it would leave them uncategorised.`
            : 'Nothing currently uses this category.'
        }
        destructive
        confirmLabel="Delete and uncategorise"
        onCancel={() => setDeleting(null)}
        options={
          deleting && deleting.usage.total > 0
            ? [
                {
                  label: 'Mark inactive instead (keeps history)',
                  icon: 'eye-off',
                  onPress: async () => {
                    if (!uid || !deleting) return;
                    await deleteCategory(uid, deleting.category.id, { mode: 'deactivate' });
                    setDeleting(null);
                    toast.show('Category marked inactive.');
                  },
                },
              ]
            : undefined
        }
        onConfirm={async () => {
          if (!uid || !deleting) return;
          try {
            await deleteCategory(uid, deleting.category.id, {
              mode: 'reassign',
              targetCategoryId: null,
            });
            setDeleting(null);
            toast.show('Category deleted.');
          } catch (e) {
            toast.show(toFriendlyError(e, 'Could not delete').message, 'error');
          }
        }}
      />
    </Screen>
  );
}
