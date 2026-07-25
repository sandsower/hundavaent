import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceExtensions = new Set(['.css', '.svelte']);

// A custom property with no definition is invalid at computed-value time: the declaration still
// wins the cascade and then resolves to unset, so a background silently becomes transparent and a
// colour silently inherits. Nothing errors and nothing is logged, which is how an invisible unread
// cue and a hard basalt border on a featured panel both shipped unnoticed.
const referencePattern = /var\(\s*(--hv-[a-z0-9-]+)\s*(,|\))/g;
const definitionPattern = /(--hv-[a-z0-9-]+)\s*:/g;

interface Reference {
  token: string;
  path: string;
  line: number;
  hasFallback: boolean;
}

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

function lineFor(content: string, offset: number): number {
  return content.slice(0, offset).split('\n').length;
}

describe('design-system token resolution', () => {
  it('resolves every referenced design token to a definition', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../../..');
    const sourceRoot = resolve(repositoryRoot, 'src');
    const defined = new Set<string>();
    const references: Reference[] = [];

    for (const path of await sourceFiles(sourceRoot)) {
      const content = await readFile(path, 'utf8');
      const repositoryPath = relative(repositoryRoot, path);

      for (const match of content.matchAll(definitionPattern)) defined.add(match[1]);
      for (const match of content.matchAll(referencePattern)) {
        references.push({
          token: match[1],
          path: repositoryPath,
          line: lineFor(content, match.index),
          hasFallback: match[2] === ','
        });
      }
    }

    expect(references.length).toBeGreaterThan(0);

    const unresolved = references
      .filter((reference) => !defined.has(reference.token))
      .map((reference) => `${reference.path}:${reference.line} ${reference.token}`);

    expect(unresolved).toEqual([]);
  });

  it('keeps token definitions in the design system rather than in feature modules', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../../..');
    const sourceRoot = resolve(repositoryRoot, 'src');
    const strayDefinitions: string[] = [];

    // The design system owns the semantic contract; app.css owns the few app-shell constants
    // that sit above it. Everything else is a feature module.
    const ownerPaths = ['src/lib/design-system/', 'src/app.css'];

    for (const path of await sourceFiles(sourceRoot)) {
      const repositoryPath = relative(repositoryRoot, path);
      if (ownerPaths.some((owner) => repositoryPath.startsWith(owner))) continue;

      const content = await readFile(path, 'utf8');
      for (const match of content.matchAll(definitionPattern)) {
        // Feature modules may still set a local value for a token the design system owns; what
        // they must not do is introduce a brand-new --hv- name that only they know about.
        strayDefinitions.push(`${repositoryPath}:${lineFor(content, match.index)} ${match[1]}`);
      }
    }

    const designSystem = await readFile(
      resolve(sourceRoot, 'lib/design-system/tokens.css'),
      'utf8'
    );
    const owned = new Set([...designSystem.matchAll(definitionPattern)].map((match) => match[1]));

    expect(strayDefinitions.filter((entry) => !owned.has(entry.split(' ')[1]))).toEqual([]);
  });
});
