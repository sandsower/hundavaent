import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every view-transition-name in the source, by design. A duplicate name on one page aborts the
 * whole transition silently - no red test, no console error, the morph just stops happening -
 * so the set of declarations is pinned here. A new name is a deliberate decision: it needs a
 * timing override in app.css (the UA's 250ms default is invisible to the motion drift test)
 * and a fade-suppression rule when the named element carries text.
 */
const expectedDeclarations = new Map([
  ['src/lib/design-system/primitives.css', ['page-title']],
  ['src/routes/[lang=lang]/+layout.svelte', ['site-header']],
  ['src/routes/[lang=lang]/about/+page.svelte', ['page-title']]
]);

const sourceExtensions = new Set(['.css', '.svelte']);
const namePattern = /view-transition-name\s*:\s*([a-z-]+)/g;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.isFile() && sourceExtensions.has(extname(entry.name)) ? [path] : [];
    })
  );
  return files.flat();
}

describe('view transition names', () => {
  it('match the deliberate set exactly', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../../..');
    const found = new Map<string, string[]>();

    for (const path of await sourceFiles(resolve(repositoryRoot, 'src'))) {
      const content = await readFile(path, 'utf8');
      const names = [...content.matchAll(namePattern)]
        .map((match) => match[1])
        .filter((name) => name !== 'none');
      if (names.length > 0) found.set(relative(repositoryRoot, path), names);
    }

    expect(Object.fromEntries(found)).toEqual(Object.fromEntries(expectedDeclarations));
  });
});
