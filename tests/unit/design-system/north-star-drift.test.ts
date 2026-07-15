import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceExtensions = new Set(['.css', '.js', '.svelte', '.ts']);
const obsoleteVariableNames = [
  'radius-organic',
  'shadow-offset',
  'paper-raised',
  'paper-light',
  'paper-deep',
  'coral-dark',
  'coral-soft',
  'ink-soft',
  'paper',
  'coral',
  'amber',
  'focus',
  'ink',
  'mint',
  'sun',
  'teal'
];
const obsoleteVariablePattern = new RegExp(`--(?:${obsoleteVariableNames.join('|')})\\b`, 'g');
const decorativeRadialGradientPattern = /radial-gradient\s*\(/g;

interface DriftFinding {
  path: string;
  line: number;
  match: string;
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

describe('north-star source drift', () => {
  it('rejects obsolete palette aliases and decorative organic styling', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../../..');
    const sourceRoot = resolve(repositoryRoot, 'src');
    const findings: DriftFinding[] = [];

    for (const path of await sourceFiles(sourceRoot)) {
      const content = await readFile(path, 'utf8');
      const repositoryPath = relative(repositoryRoot, path);

      for (const match of content.matchAll(obsoleteVariablePattern)) {
        findings.push({
          path: repositoryPath,
          line: lineFor(content, match.index),
          match: match[0]
        });
      }

      // Map rendering may use radial geometry for real cartographic marks. The north-star guard
      // targets decorative product-surface gradients without constraining the map renderer.
      if (!repositoryPath.startsWith('src/lib/map/')) {
        for (const match of content.matchAll(decorativeRadialGradientPattern)) {
          findings.push({
            path: repositoryPath,
            line: lineFor(content, match.index),
            match: match[0]
          });
        }
      }
    }

    expect(findings).toEqual([]);
  });
});
