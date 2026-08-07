import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ResidualStyleCategory =
  'animation' | 'cross-component' | 'selector-exception' | 'design-system' | 'design-artifact';

export interface ResidualStyleEntry {
  path: string;
  sha256: string;
  categories: ResidualStyleCategory[];
}

interface ResidualStyleAllowlist {
  entries: ResidualStyleEntry[];
}

export type ResidualStyleInventoryEntry = ResidualStyleEntry;

const STYLE_PATTERN = /<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g;
const SCAN_ROOTS = [
  'src',
  'packages/design-system/src',
  'packages/design-system/design-sync/cards'
];

function extractStyleBlocks(source: string): string[] {
  return [...source.matchAll(STYLE_PATTERN)].map((match) => match[1].replaceAll('\r\n', '\n'));
}

export function digestStyleBlocks(source: string): string | null {
  const blocks = extractStyleBlocks(source);
  if (blocks.length === 0) return null;

  return createHash('sha256').update(blocks.join('\n<!-- next-style-block -->\n')).digest('hex');
}

export function classifyResidualStyles(path: string, source: string): ResidualStyleCategory[] {
  const residual = extractStyleBlocks(source).join('\n');
  const categories: ResidualStyleCategory[] = [];
  if (residual.includes('@keyframes') || residual.includes('animation:')) {
    categories.push('animation');
  }
  if (residual.includes(':global')) categories.push('cross-component');
  if (residual.includes('/* stays:')) categories.push('selector-exception');
  if (path.endsWith('.stories.svelte') || path.startsWith('packages/design-system/design-sync/')) {
    categories.push('design-artifact');
  } else if (path.startsWith('packages/design-system/src/lib/')) {
    categories.push('design-system');
  }
  return categories.sort();
}

async function collectSvelteFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectSvelteFiles(path);
      if (entry.isFile() && entry.name.endsWith('.svelte')) return [path];
      return [];
    })
  );
  return files.flat();
}

export async function collectResidualStyleInventory(
  repositoryRoot: string
): Promise<ResidualStyleInventoryEntry[]> {
  const files = (
    await Promise.all(SCAN_ROOTS.map((root) => collectSvelteFiles(join(repositoryRoot, root))))
  ).flat();
  const inventory: ResidualStyleInventoryEntry[] = [];

  for (const path of files) {
    const source = await readFile(path, 'utf8');
    const sha256 = digestStyleBlocks(source);
    if (sha256) {
      const repositoryPath = relative(repositoryRoot, path).replaceAll('\\', '/');
      inventory.push({
        path: repositoryPath,
        sha256,
        categories: classifyResidualStyles(repositoryPath, source)
      });
    }
  }

  return inventory.sort((left, right) => left.path.localeCompare(right.path));
}

export function validateResidualStyleInventory(
  actual: ResidualStyleInventoryEntry[],
  allowed: ResidualStyleEntry[]
): string[] {
  const actualByPath = new Map(actual.map((entry) => [entry.path, entry]));
  const allowedByPath = new Map(allowed.map((entry) => [entry.path, entry]));
  const problems: string[] = [];

  for (const entry of actual) {
    const approved = allowedByPath.get(entry.path);
    if (!approved) {
      problems.push(`${entry.path}: contains an unapproved <style> block`);
    } else {
      if (approved.sha256 !== entry.sha256) {
        problems.push(
          `${entry.path}: residual <style> content changed; review it and update the allowlist`
        );
      }
      if (approved.categories.slice().sort().join(',') !== entry.categories.join(',')) {
        problems.push(`${entry.path}: recorded residual categories do not match the style block`);
      }
    }
  }

  for (const entry of allowed) {
    if (!actualByPath.has(entry.path)) {
      problems.push(
        `${entry.path}: allowlist entry is stale because the residual <style> block is gone`
      );
    }
    if (entry.categories.length === 0) {
      problems.push(`${entry.path}: allowlist entry must record at least one residual category`);
    }
  }

  return problems.sort();
}

export async function checkTailwindResidualStyles(repositoryRoot: string): Promise<string[]> {
  const allowlistPath = join(repositoryRoot, 'scripts/tailwind-residual-styles.json');
  const allowlist = JSON.parse(await readFile(allowlistPath, 'utf8')) as ResidualStyleAllowlist;
  return validateResidualStyleInventory(
    await collectResidualStyleInventory(repositoryRoot),
    allowlist.entries
  );
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (currentFile === invokedFile) {
  const repositoryRoot = resolve(dirname(currentFile), '..');
  const problems = await checkTailwindResidualStyles(repositoryRoot);

  if (problems.length > 0) {
    console.error('Tailwind residual-style guard failed:');
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('Tailwind residual-style guard passed.');
  }
}
