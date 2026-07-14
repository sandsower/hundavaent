import { execFileSync } from 'node:child_process';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export type ReadinessFindingKind =
  'forbidden-path' | 'personal-path' | 'private-tracker' | 'ticket-shorthand';

export interface ReadinessFinding {
  kind: ReadinessFindingKind;
  path: string;
  detail: string;
}

const forbiddenPathPrefixes = ['plans/', 'checkpoints/', 'research/'];

const forbiddenExactPaths = new Set([
  '.beislid/action-policy.json',
  '.beislid/checkpoints/latest.json',
  '.crust/bundle.jsonc',
  'WORKFLOW.md',
  'data/launch-inventory/leads.json'
]);

const contentScanExtensions = new Set([
  '',
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsonc',
  '.md',
  '.mjs',
  '.sql',
  '.svelte',
  '.toml',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml'
]);

const contentScanExclusions = new Set(['pnpm-lock.yaml', 'src/lib/server/db/generated.types.ts']);

const ticketShorthandPattern = /\bvib-\d+\b/gi;
const personalPathPattern = /(?:\/Users\/|\/home\/|~\/Personal\/)/g;
const privateTrackerPattern = /linear\.app\/teotl/g;

export function inspectTrackedPath(path: string): ReadinessFinding[] {
  if (forbiddenExactPaths.has(path)) {
    return [{ kind: 'forbidden-path', path, detail: 'private repository state must be archived' }];
  }

  if (forbiddenPathPrefixes.some((prefix) => path.startsWith(prefix))) {
    return [{ kind: 'forbidden-path', path, detail: 'private source tree must be archived' }];
  }

  if (path.startsWith('.env') && path !== '.env.example') {
    return [{ kind: 'forbidden-path', path, detail: 'environment files must not be tracked' }];
  }

  return [];
}

function matches(pattern: RegExp, content: string): string[] {
  pattern.lastIndex = 0;
  return [...content.matchAll(pattern)].map((match) => match[0]);
}

export function inspectTrackedContent(path: string, content: string): ReadinessFinding[] {
  if (contentScanExclusions.has(path) || !contentScanExtensions.has(extname(path))) {
    return [];
  }

  const findings: ReadinessFinding[] = [];
  const personalPaths = matches(personalPathPattern, content);
  const trackerReferences = matches(privateTrackerPattern, content);
  const ticketReferences = matches(ticketShorthandPattern, content);

  if (personalPaths.length > 0) {
    findings.push({
      kind: 'personal-path',
      path,
      detail: `${personalPaths.length} personal filesystem path reference(s)`
    });
  }

  if (trackerReferences.length > 0) {
    findings.push({
      kind: 'private-tracker',
      path,
      detail: `${trackerReferences.length} private tracker reference(s)`
    });
  }

  if (ticketReferences.length > 0) {
    findings.push({
      kind: 'ticket-shorthand',
      path,
      detail: `${ticketReferences.length} ticket identifier reference(s): ${[
        ...new Set(ticketReferences)
      ].join(', ')}`
    });
  }

  return findings;
}

export function scanOpenSourceReadiness(repositoryRoot: string): ReadinessFinding[] {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  })
    .split('\0')
    .filter(Boolean);

  return tracked.flatMap((path) => {
    const pathFindings = inspectTrackedPath(path);
    if (pathFindings.length > 0) {
      return pathFindings;
    }

    try {
      const content = readFileSync(resolve(repositoryRoot, path), 'utf8');
      return inspectTrackedContent(path, content);
    } catch {
      return [];
    }
  });
}

function run(): void {
  const repositoryRoot = resolve(import.meta.dirname, '..');
  const findings = scanOpenSourceReadiness(repositoryRoot);

  if (findings.length === 0) {
    console.log('Open-source repository boundary is clean.');
    return;
  }

  for (const finding of findings) {
    console.error(`${finding.kind}: ${finding.path}: ${finding.detail}`);
  }

  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
