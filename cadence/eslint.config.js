// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
    rules: {
      // Reanimated SharedValue assignments are the library's public mutation
      // API; React Compiler's generic immutability rule cannot distinguish it.
      'react-hooks/immutability': 'off',
      // Detail screens intentionally start async Firestore hydration on mount.
      // Their state writes happen in awaited callbacks, not during rendering.
      'react-hooks/set-state-in-effect': 'off',
      // Existing memoization remains correct even when the compiler elects to
      // skip optimizing a component that consumes mutable Firebase snapshots.
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
]);
