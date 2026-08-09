/**
 * The Firebase JS SDK exposes `getReactNativePersistence` only from its
 * react-native build. Metro resolves that build on Android/iOS, but the
 * package's top-level published TypeScript types point at the browser bundle,
 * so the symbol is declared here.
 */
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }): Persistence;
}
