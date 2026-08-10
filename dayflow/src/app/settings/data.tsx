import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { InlineNote, TextField } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { Body, Caption } from '@/components/ui/Text';
import { APP_NAME } from '@/constants/app';
import { deleteAllUserData, exportUserData } from '@/services/exportService';
import { toFriendlyError } from '@/services/firebase/errors';
import { cancelAll } from '@/services/notificationService';
import { deleteAccount } from '@/services/userService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function DataSettings() {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const teardown = useDataStore((s) => s.teardown);

  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const doExport = async (format: 'json' | 'csv') => {
    if (!uid) return;
    setExporting(format);
    try {
      const result = await exportUserData(uid, format);
      toast.show(result.shared ? 'Export ready.' : `Saved as ${result.filename}.`, 'success');
    } catch (e) {
      toast.show(toFriendlyError(e, 'Export failed').message, 'error');
    } finally {
      setExporting(null);
    }
  };

  const doDeleteAccount = async () => {
    if (!uid) return;
    setDeleting(true);
    try {
      await cancelAll();
      await deleteAllUserData(uid);
      await deleteAccount(password || undefined);
      teardown();
      setConfirmDelete(false);
      toast.show('Account deleted.');
      router.replace('/(auth)/welcome');
    } catch (e) {
      const friendly = toFriendlyError(e, 'Could not delete the account');
      toast.show(
        friendly.code === 'auth/requires-recent-login'
          ? 'Enter your password to confirm, or sign in again first.'
          : friendly.message,
        'error',
      );
      setDeleting(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="Data" eyebrow="Settings" showBack />
      <ScreenScroll>
        <View style={{ gap: space.xl, paddingTop: space.sm }}>
          <View style={{ gap: space.md }}>
            <SectionHeader title="Export" />
            <Body tone="muted" style={{ fontSize: 13 }}>
              Everything you have recorded — routines and their logs, tasks, subjects, chapters,
              topics, study sessions, timetable, revisions, daily and weekly summaries.
            </Body>
            <Button
              label="Export as JSON"
              icon="download"
              variant="outline"
              full
              loading={exporting === 'json'}
              onPress={() => doExport('json')}
            />
            <Button
              label="Export as CSV"
              icon="download"
              variant="outline"
              full
              loading={exporting === 'csv'}
              onPress={() => doExport('csv')}
            />
            <Caption tone="faint">
              CSV is written as one labelled section per collection, which spreadsheets can split
              apart.
            </Caption>
          </View>

          <View style={{ gap: space.md }}>
            <SectionHeader title="Danger zone" />
            <InlineNote
              icon="alert-triangle"
              text={`Deleting your account permanently removes every ${APP_NAME} record. Export first if you want a copy.`}
            />
            <TextField
              label="Confirm with your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Required if you signed in a while ago"
            />
            <Button
              label="Delete account"
              icon="trash-2"
              variant="danger"
              full
              onPress={() => setConfirmDelete(true)}
            />
          </View>
        </View>
      </ScreenScroll>

      <ConfirmationDialog
        visible={confirmDelete}
        title="Delete your account?"
        message="Every routine, task, session, chapter and summary will be permanently deleted. This cannot be undone."
        destructive
        confirmLabel="Delete everything"
        loading={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDeleteAccount}
      />
    </Screen>
  );
}
