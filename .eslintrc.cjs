module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: [
      './tsconfig.main.json',
      './tsconfig.preload.json',
      './tsconfig.renderer.json',
      './tsconfig.node.json',
      './tsconfig.tests.json',
    ],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'lumo'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: {
    react: { version: 'detect' },
  },
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  rules: {
    'no-eval': 'error',
    'no-new-func': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': 'error',
    'react/react-in-jsx-scope': 'off',
    'lumo/no-inline-fetch': 'error',
    'lumo/no-string-concat-paths': 'warn',
  },
  overrides: [
    {
      files: ['**/*.cjs', '**/*.js'],
      parserOptions: { project: null },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
    {
      files: ['tests/**/*.ts', 'tests/**/*.tsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
  ignorePatterns: [
    'dist/**',
    'out/**',
    'build/**',
    'node_modules/**',
    'resources/face-api/**',
    'coverage/**',
    '.eslint-rules/**',
  ],
};
