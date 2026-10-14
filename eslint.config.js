// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "supabase/*"],
  },
  {
    // Apostrophes in React Native <Text> are fine; this rule is for HTML.
    rules: { "react/no-unescaped-entities": "off" },
  }
]);
