import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceExtensions = new Set(['.css', '.svelte', '.ts']);

// The single source of motion timing. Everything else references it.
const tokenSourcePath = 'src/lib/design-system/tokens.css';
// Its TypeScript mirror, for consumers that cannot read custom properties. The browser parity
// test holds the two together, so its literals are the one sanctioned script-side copy.
const motionSourcePath = 'src/lib/design-system/motion.ts';

/**
 * Surfaces that still hard-code their own durations and easings, each one waiting for the phase
 * of the motion revamp that converts it. This set may only shrink. Adding an entry is how the
 * revamp regresses, so it should never happen without a deliberate decision in review.
 */
const unconvertedSurfaces = new Set([
  'src/app.css',
  'src/lib/member-activity/WeeklyRhythmAcknowledgement.svelte',
  'src/lib/member-activity/WeeklyRhythmTrail.svelte',
  'src/lib/roundup/RoundupTrailIcon.svelte',
  'src/routes/[lang=lang]/account/impact/+page.svelte',
  'src/routes/[lang=lang]/account/keep-current/+page.svelte',
  'src/routes/[lang=lang]/account/roundup/+page.svelte'
]);

// Declarations are matched across newlines: a multi-line `transition:` is exactly the shape a
// hand-picked duration hides in, and a line-by-line scan walks straight past it.
//
// Delays count as timing. A staggered cascade written as `animation-delay: 60ms` drifts from
// the token scale exactly as a hand-picked duration does, and it is the half of a stagger that
// has to collapse for reduced motion to work.
const durationDeclarationPattern = /\b(?:transition|animation)(?:-duration|-delay)?\s*:[^;{}]*/g;
const durationLiteralPattern = /\b\d+(?:\.\d+)?m?s\b/;
const easingPattern = /cubic-bezier\s*\(/g;

// Durations picked in script drift exactly as CSS ones do, but they hide in plain assignments:
// `mapMotionDuration = $derived(reducedMotion ? 0 : 450)` carries no unit for a unit pattern to
// find. Any duration-named binding whose right-hand side contains a multi-digit numeric literal
// is treated as a hand-picked duration; zero stays legal because it means "jump, don't animate".
// The scan is case-insensitive (SCREAMING_CASE constants), spans Prettier-wrapped statements
// (stopping at `;` or a brace), and counts `1_000`-style separators as multi-digit. Bare timer
// delays like `setTimeout(fn, 320)` are deliberately out of scope: motion.ts names cleanup
// timers as a sanctioned JavaScript consumer.
const scriptDurationPattern = /\b\w*duration\w*\s*[:=][^;{}]*?\b\d[\d_]+(?:\.\d+)?\b[^;\n]*/gi;

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
    if (repositoryPath === tokenSourcePath || repositoryPath === motionSourcePath) continue;

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

    for (const assignment of content.matchAll(scriptDurationPattern)) {
      findings.push({
        path: repositoryPath,
        line: lineFor(assignment.index),
        match: assignment[0].replaceAll(/\s+/g, ' ').trim()
      });
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
