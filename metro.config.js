// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Every Zod entry point re-exports all 64 translations (~0.6 MB); Roami only uses English.
const zodLocales = path.join('zod', 'v4', 'locales', 'index.js');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolved = context.resolveRequest(context, moduleName, platform);
  if (resolved.type === 'sourceFile' && resolved.filePath.endsWith(zodLocales)) {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'src/lib/zod-locales.js') };
  }
  return resolved;
};

module.exports = config;
