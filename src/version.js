/* global __BUILD_ID__ */
// The build id this bundle was compiled with (see vite.config.js `define`).
// Compared against the live dist/version.json by useVersionCheck to detect
// when a newer deploy is available. Falls back to 'dev' if the define is
// absent (e.g. a test runner that doesn't apply Vite's replacement).
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
