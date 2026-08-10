import { FirebaseError } from 'firebase/app';

export interface FriendlyError {
  title: string;
  message: string;
  code: string;
  /** True when retrying later is likely to succeed. */
  retryable: boolean;
}

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address does not look right.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account exists for that email.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account already exists for that email.',
  'auth/weak-password': 'Choose a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': 'No connection. Check your network and try again.',
  'auth/requires-recent-login': 'Please sign in again to complete this action.',
  'auth/operation-not-allowed':
    'Email sign-in is not enabled for this project yet.',
  'auth/missing-password': 'Enter your password.',
};

const FIRESTORE_MESSAGES: Record<string, string> = {
  'permission-denied': 'You do not have access to that data.',
  unavailable: 'Cannot reach the server. Your changes are saved locally and will sync.',
  'deadline-exceeded': 'The request timed out. Please try again.',
  'failed-precondition': 'That action cannot be completed right now.',
  'not-found': 'That item no longer exists.',
  'already-exists': 'That item already exists.',
  cancelled: 'The request was cancelled.',
  unauthenticated: 'Your session expired. Please sign in again.',
  'resource-exhausted': 'Too many requests. Please slow down.',
};

const RETRYABLE = new Set([
  'unavailable',
  'deadline-exceeded',
  'cancelled',
  'auth/network-request-failed',
  'auth/too-many-requests',
  'resource-exhausted',
  'internal',
]);

export function toFriendlyError(error: unknown, fallbackTitle = 'Something went wrong'): FriendlyError {
  if (error instanceof FirebaseError) {
    const code = error.code;
    const message =
      AUTH_MESSAGES[code] ??
      FIRESTORE_MESSAGES[code.replace('firestore/', '')] ??
      error.message;
    return {
      title: code.startsWith('auth/') ? 'Sign-in problem' : fallbackTitle,
      message,
      code,
      retryable: RETRYABLE.has(code) || RETRYABLE.has(code.replace('firestore/', '')),
    };
  }
  if (error instanceof Error) {
    return { title: fallbackTitle, message: error.message, code: 'unknown', retryable: false };
  }
  return {
    title: fallbackTitle,
    message: 'An unexpected error occurred.',
    code: 'unknown',
    retryable: false,
  };
}

export function isOfflineError(error: unknown): boolean {
  return (
    error instanceof FirebaseError &&
    (error.code === 'unavailable' || error.code === 'auth/network-request-failed')
  );
}
