/**
 * `npm run lint` was defined in package.json but no ESLint configuration
 * existed, so the script has never actually run. This is the missing config.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'supabase/**'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh', 'jsx-a11y'],
  rules: {
    // The codebase does not use the new JSX transform import, and prop types
    // are not in use; neither is a correctness problem.
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react/no-unescaped-entities': 'off',

    // Unused variables usually mean a refactor left something behind.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

    // Allow deliberate console use on the server and for warnings.
    'no-console': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],

    // The only occurrences are redundant escapes inside the character class of
    // the password-strength regexes in Register.jsx and AdminInvite.jsx. They
    // are harmless, and rewriting a credential-validation pattern to satisfy a
    // style rule is not worth the risk of a subtle behaviour change.
    'no-useless-escape': 'warn',
  },
  overrides: [
    {
      files: ['server/**/*.js'],
      env: { node: true, browser: false },
    },
    {
      files: ['load-tests/**/*.js'],
      // k6 injects these at runtime; they are not Node or browser globals.
      globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly' },
    },
    {
      files: ['e2e/**/*.js', 'playwright.config.js'],
      env: { node: true },
    },
    {
      files: ['**/__tests__/**/*.js'],
      env: { node: true },
      globals: { describe: 'readonly', it: 'readonly', expect: 'readonly', vi: 'readonly' },
    },
  ],
};
