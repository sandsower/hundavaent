import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.svelte-kit/**',
      'build/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '**/storybook-static/**',
      'src/lib/server/db/generated.types.ts'
    ]
  },
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  ...svelte.configs['flat/prettier'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },
  {
    // Scoped to stories files: the destructure-to-exclude idiom ({ children, ...rest } with
    // children deliberately unbound) is how Storybook's snippet-bearing `template(args)` blocks
    // strip a prop before spreading the rest onto Button, and the sibling is not dead code there.
    // Leaving this unscoped would allow the same silently-unused-sibling pattern to slip past
    // review anywhere else in the codebase, not just at the idiom that actually needs it.
    files: ['**/*.stories.svelte'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }]
    }
  }
);
