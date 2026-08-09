// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Expo SDK 57 selects package export conditions per platform: `react-native`
// for Android/iOS and `browser` for web. Keep the defaults so Firebase Auth
// uses AsyncStorage on native and durable browser persistence on web.

module.exports = config;
