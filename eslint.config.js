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
    rules: {
      // The destructure-to-exclude idiom ({ children, ...rest } with children deliberately
      // unbound) is how snippet-bearing components strip a prop before spreading; the sibling
      // is not dead code.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }]
    }
  }
);
