import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import globals from 'globals';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  prettier,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // Keep spacing on the 4px design scale. Arbitrary px/rem/em values in
      // spacing utilities (margin, padding, gap, inset, position, size)
      // silently break the rhythm, so ban them here instead of relying on
      // review. See docs/spacing-audit.md for the scale and the audit.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/\\b(?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|bottom|left|right|size)-\\[[0-9.]+(?:px|rem|em)\\]/]',
          message:
            'Arbitrary spacing value detected. Use the 4px design scale (e.g. `p-2`, `gap-4`, `mt-6`) instead of bracket values like `p-[10px]`. See docs/spacing-audit.md.',
        },
        {
          selector:
            'TemplateElement[value.cooked=/\\b(?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|bottom|left|right|size)-\\[[0-9.]+(?:px|rem|em)\\]/]',
          message:
            'Arbitrary spacing value detected. Use the 4px design scale (e.g. `p-2`, `gap-4`, `mt-6`) instead of bracket values like `p-[10px]`. See docs/spacing-audit.md.',
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'coverage/**',
    'dist/**',
    'node_modules/**',
    'next-env.d.ts',
  ]),
]);
