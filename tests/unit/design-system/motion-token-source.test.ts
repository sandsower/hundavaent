import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fadeDurationsMs, motionDurationsMs } from '../../../src/lib/design-system/motion';

// Derived from the canonical steps so a new step cannot silently skip the reduce contract.
const motionTokenNames = Object.keys(motionDurationsMs).map((step) => `--hv-motion-${step}`);
const fadeTokenNames = Object.keys(fadeDurationsMs).map((step) => `--hv-fade-${step}`);

const reducedMotionBlockPattern =
  /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{(?<body>[\s\S]*?\n\s*\})\s*\}/;

async function readTokenSource(): Promise<string> {
  const repositoryRoot = resolve(import.meta.dirname, '../../..');
  return readFile(resolve(repositoryRoot, 'src/lib/design-system/tokens.css'), 'utf8');
}

describe('motion token source', () => {
  it('suppresses every motion duration under reduced motion', async () => {
    const source = await readTokenSource();
    const reducedMotionBlock = reducedMotionBlockPattern.exec(source)?.groups?.body;

    expect(reducedMotionBlock).toBeDefined();
    for (const token of motionTokenNames) {
      expect(reducedMotionBlock).toContain(token);
    }
  });

  it('preserves every fade duration under reduced motion', async () => {
    const source = await readTokenSource();
    const reducedMotionBlock = reducedMotionBlockPattern.exec(source)?.groups?.body;

    expect(reducedMotionBlock).toBeDefined();
    // Fades do not move, so they stay at full duration for Members who prefer reduced motion.
    // Listing one here would silently flatten the calm-not-broken behaviour the families exist for.
    for (const token of fadeTokenNames) {
      expect(reducedMotionBlock).not.toContain(token);
    }
  });

  it('applies the reduced-motion override to both token-declaring selectors', async () => {
    const source = await readTokenSource();
    const reducedMotionBlock = reducedMotionBlockPattern.exec(source)?.groups?.body;

    expect(reducedMotionBlock).toBeDefined();
    // tokens.css declares on ":root, [data-ui-mode]". A ":root"-only override loses to
    // [data-ui-mode] specificity everywhere inside the app shell.
    expect(reducedMotionBlock).toMatch(/:root\s*,\s*\[data-ui-mode\]/);
  });

  it('orders the reduced-motion override after the operations overrides', async () => {
    const source = await readTokenSource();
    const operationsIndex = source.indexOf("[data-ui-mode='operations']");
    const reducedMotionIndex = source.search(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);

    expect(operationsIndex).toBeGreaterThan(-1);
    expect(reducedMotionIndex).toBeGreaterThan(-1);
    // Equal specificity means source order decides. Moving the reduced-motion block above the
    // operations block would silently stop suppressing motion for Moderators.
    expect(reducedMotionIndex).toBeGreaterThan(operationsIndex);
  });
});
