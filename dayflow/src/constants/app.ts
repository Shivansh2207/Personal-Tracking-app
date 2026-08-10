/**
 * Central product identity.
 *
 * The product name is deliberately kept in exactly one place. Changing
 * `APP_NAME` here renames every user-visible occurrence in the app; the only
 * other places the name appears are `app.json` (store listing / bundle id) and
 * the README.
 */

export const APP_NAME = 'DayFlow';

export const APP_TAGLINE = 'Build a day that runs itself.';

export const APP_SUBTITLE =
  'Plan your routines, study timetable and responsibilities once. ' +
  `${APP_NAME} automatically prepares each day and tracks how consistently you follow it.`;

/** Prefix for AsyncStorage keys, so a rename never orphans stored preferences. */
export const STORAGE_PREFIX = 'dayflow';

export const SUPPORT_EMAIL = null as string | null;
