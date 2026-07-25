import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceExtensions = new Set(['.css', '.svelte']);

// The single source of motion timing. Everything else references it.
const tokenSourcePath = 'src/lib/design-system/tokens.css';

/**
 * Surfaces that still hard-code their own durations and easings, each one waiting for the phase
 * of the motion revamp that converts it. This set may only shrink. Adding an entry is how the
 * revamp regresses, so it should never happen without a deliberate decision in review.
 */
const unconvertedSurfaces = new Set([
  'src/app.css',
  'src/lib/achievements/AchievementCelebration.svelte',
  'src/lib/achievements/AchievementUnreadIndicator.svelte',
  'src/lib/auth/AuthDialog.svelte',
  'src/lib/discovery/AccessSymbols.svelte',
  'src/lib/discovery/InlineRating.svelte',
  'src/lib/discovery/MapListShell.svelte',
  'src/lib/discovery/SelectedPlaceCard.svelte',
  'src/lib/discovery/SharePlaceControl.svelte',
  'src/lib/member-activity/WeeklyRhythmAcknowledgement.svelte',
  'src/lib/member-activity/WeeklyRhythmTrail.svelte',
  'src/lib/roundup/RoundupTrailIcon.svelte',
  'src/routes/[lang=lang]/account/achievements/+page.svelte',
  'src/routes/[lang=lang]/account/impact/+page.svelte',
  'src/routes/[lang=lang]/account/keep-current/+page.svelte',
  'src/routes/[lang=lang]/account/roundup/+page.svelte'
]);

// Declarations are matched across newlines: a multi-line `transition:` is exactly the shape a
// hand-picked duration hides in, and a line-by-line scan walks straight past it.
const durationDeclarationPattern = /\b(?:transition|animation)(?:-duration)?\s*:[^;{}]*/g;
const durationLiteralPattern = /\b\d+(?:\.\d+)?m?s\b/;
const easingPattern = /cubic-bezier\s*\(/g;

/** Blanks comments while preserving offsets, so reported line numbers stay accurate. */
function withoutComments(content: string): string {
  return content.replaceAll(/\/\*[\s\S]*?\*\/|(?<=^|[\s;{])\/\/[^\n]*/g, (comment) =>
    comment.replaceAll(/[^\n]/g, ' ')
  );
}

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

async function findMotionLiterals(): Promise<DriftFinding[]> {
  const repositoryRoot = resolve(import.meta.dirname, '../../..');
  const findings: DriftFinding[] = [];

  for (const path of await sourceFiles(resolve(repositoryRoot, 'src'))) {
    const repositoryPath = relative(repositoryRoot, path);
    if (repositoryPath === tokenSourcePath) continue;

    const content = withoutComments(await readFile(path, 'utf8'));
    const lineFor = (offset: number): number => content.slice(0, offset).split('\n').length;

    for (const declaration of content.matchAll(durationDeclarationPattern)) {
      if (!durationLiteralPattern.test(declaration[0])) continue;
      findings.push({
        path: repositoryPath,
        line: lineFor(declaration.index),
        match: declaration[0].replaceAll(/\s+/g, ' ').trim()
      });
    }

    for (const easing of content.matchAll(easingPattern)) {
      findings.push({ path: repositoryPath, line: lineFor(easing.index), match: easing[0] });
    }
  }

  return findings;
}

describe('motion token drift', () => {
  it('keeps converted surfaces free of hand-picked durations and easings', async () => {
    const findings = await findMotionLiterals();
    const converted = findings.filter((finding) => !unconvertedSurfaces.has(finding.path));

    expect(converted).toEqual([]);
  });

  it('does not list surfaces that no longer hard-code motion', async () => {
    const findings = await findMotionLiterals();
    const offending = new Set(findings.map((finding) => finding.path));
    const stale = [...unconvertedSurfaces].filter((path) => !offending.has(path));

    // Keeping a converted surface on the list would quietly re-open the door it just closed.
    expect(stale).toEqual([]);
  });
});
