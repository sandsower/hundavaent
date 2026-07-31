import { Button } from '@hundavaent/design-system';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

// app.css is the app's real CSS entrypoint: it pulls in tokens.css and the package theme.css,
// which is where the design system's single :focus-visible owner lives (theme.css, @layer base).
// This suite is the only place that rule is pinned - it sits in the lowest cascade layer on
// purpose, so any future unlayered rule as weak as `button { outline: none }` would beat it
// silently, and no other suite asserts ring geometry at all.
import '../../src/app.css';

function label(text: string) {
  return createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));
}

// Resolves a token through the browser's own computation so the assertion tracks tokens.css
// instead of pinning a literal that drifts. The not-currentColor guard below keeps the comparison
// from going vacuous: if neither side resolved (a CSS-less harness), both would collapse to the
// element's inherited color and the test would pass for any ring at all.
function resolvedColor(token: string): string {
  const probe = document.createElement('div');
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

describe('focus ring single ownership', () => {
  it('renders the canonical ring on a keyboard-focused Button from theme.css alone', async () => {
    const { container } = render(Button, {
      props: { children: label('Focus me') }
    });
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    if (!button) return;

    const ringColor = resolvedColor('--hv-focus-ring');
    const offsetColor = resolvedColor('--hv-focus-offset');
    expect(ringColor).not.toBe(getComputedStyle(button).color);

    // A real Tab press: programmatic focus() leaves :focus-visible to a heuristic, a trusted
    // keyboard event does not.
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).toBe(button);

    const focused = getComputedStyle(button);
    expect(focused.outlineStyle).toBe('solid');
    expect(focused.outlineWidth).toBe('3px');
    expect(focused.outlineOffset).toBe('3px');
    expect(focused.outlineColor).toBe(ringColor);
    expect(focused.boxShadow).toBe(`${offsetColor} 0px 0px 0px 2px`);
  });
});
