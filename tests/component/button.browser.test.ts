import { Button } from '@hundavaent/design-system';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

// app.css is the app's real CSS entrypoint and, since the FavouriteControl migration, it already
// imports @hundavaent/design-system/theme.css - so loading it here pulls in both the plain
// --hv-* custom properties (tokens.css) and the Tailwind utility layer Button is built from, the
// same way motion-tokens.browser.test.ts and visual-foundation.browser.test.ts already load it
// for their own computed-style assertions.
import '../../src/app.css';

function label(text: string) {
  return createRawSnippet(() => ({ render: () => text }));
}

// Resolves a token through the browser's own computation rather than hardcoding a literal pixel
// or hex value: a probe element sits next to the rendered Button and asks for the same CSS
// property via the same custom property, so the assertion is about parity with the token, not
// about a value that will drift the moment tokens.css changes.
function resolvedMinHeight(): string {
  const probe = document.createElement('div');
  probe.style.minHeight = 'var(--hv-control-height)';
  document.body.append(probe);
  const value = getComputedStyle(probe).minHeight;
  probe.remove();
  return value;
}

function resolvedBorderRadius(): string {
  const probe = document.createElement('div');
  probe.style.borderRadius = 'var(--hv-radius-control)';
  document.body.append(probe);
  const value = getComputedStyle(probe).borderRadius;
  probe.remove();
  return value;
}

function resolvedBackground(token: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = `var(${token})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return value;
}

function resolvedEaseSettle(): string {
  const probe = document.createElement('div');
  probe.style.transitionTimingFunction = 'var(--hv-ease-settle)';
  document.body.append(probe);
  const value = getComputedStyle(probe).transitionTimingFunction;
  probe.remove();
  return value;
}

describe('Button', () => {
  it('renders a button with type="button" by default', () => {
    render(Button, { children: label('Save place') });

    const button = screen.getByRole('button', { name: 'Save place' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('passes through an explicit submit type', () => {
    render(Button, { type: 'submit', children: label('Save changes') });

    expect(screen.getByRole('button', { name: 'Save changes' }).getAttribute('type')).toBe(
      'submit'
    );
  });

  it('renders an anchor carrying the same base classes when href is given', () => {
    const { unmount } = render(Button, { children: label('As button') });
    const buttonClasses = screen.getByRole('button', { name: 'As button' }).className;
    unmount();

    render(Button, { href: '/place/1', children: label('Open place') });
    const link = screen.getByRole('link', { name: 'Open place' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/place/1');
    expect(link.className).toBe(buttonClasses);
  });

  it('omits aria-pressed unless the prop is explicitly given', () => {
    render(Button, { children: label('Neutral') });
    expect(screen.getByRole('button', { name: 'Neutral' }).hasAttribute('aria-pressed')).toBe(
      false
    );
  });

  it.each([
    [true, 'true'],
    [false, 'false']
  ] as const)('renders aria-pressed=%s as the string "%s"', (pressed, expected) => {
    render(Button, { pressed, children: label('Toggle') });
    expect(screen.getByRole('button', { name: 'Toggle' }).getAttribute('aria-pressed')).toBe(
      expected
    );
  });

  it('shows the signal selected look only when pressed is true', () => {
    render(Button, { pressed: true, children: label('Pressed') });
    const pressedClasses = screen.getByRole('button', { name: 'Pressed' }).classList;
    expect(pressedClasses.contains('bg-signal')).toBe(true);
    expect(pressedClasses.contains('bg-snow-raised')).toBe(false);
  });

  it('keeps the neutral look when pressed is false', () => {
    render(Button, { pressed: false, children: label('Not pressed') });
    const classes = screen.getByRole('button', { name: 'Not pressed' }).classList;
    expect(classes.contains('bg-signal')).toBe(false);
    expect(classes.contains('bg-snow-raised')).toBe(true);
  });

  it('passes disabled through to the native button', () => {
    render(Button, { disabled: true, children: label('Unavailable') });
    expect(screen.getByRole('button', { name: 'Unavailable' }).hasAttribute('disabled')).toBe(true);
  });

  it('merges a caller class alongside its own generated classes, appended last', () => {
    render(Button, { class: 'call-site-hook', children: label('Glued') });
    const classes = screen.getByRole('button', { name: 'Glued' }).className.trim().split(/\s+/);
    expect(classes).toContain('rounded-control');
    expect(classes.at(-1)).toBe('call-site-hook');
  });

  it('renders its children snippet as the only content', () => {
    render(Button, { children: label('Exact content') });
    expect(screen.getByRole('button', { name: 'Exact content' }).textContent?.trim()).toBe(
      'Exact content'
    );
  });

  it.each([
    ['neutral' as const, ['bg-snow-raised', 'text-basalt']],
    ['primary' as const, ['bg-basalt', 'text-snow-raised']],
    ['committed' as const, ['bg-signal', 'text-basalt']]
  ])('applies the %s intent as a single matched background/text pair', (intent, expected) => {
    render(Button, { intent, children: label(intent) });
    const classes = screen.getByRole('button', { name: intent }).classList;
    for (const expectedClass of expected) {
      expect(classes.contains(expectedClass)).toBe(true);
    }
    const allBackgrounds = ['bg-snow-raised', 'bg-basalt', 'bg-signal'];
    const present = allBackgrounds.filter((candidate) => classes.contains(candidate));
    expect(present).toEqual([expected[0]]);
  });

  it('resolves min-height and border-radius to the control tokens', () => {
    render(Button, { children: label('Sized') });
    const style = getComputedStyle(screen.getByRole('button', { name: 'Sized' }));
    expect(style.minHeight).toBe(resolvedMinHeight());
    expect(style.borderRadius).toBe(resolvedBorderRadius());
  });

  // Regression test for the R1 finding: theme.css's mappings must be `@theme inline`, not plain
  // `@theme`. Plain @theme emits its mappings as :root custom properties, which resolve their own
  // var() references exactly once, at :root - so a utility like rounded-control would silently
  // freeze to whatever --hv-radius-control was at :root and never see the
  // [data-ui-mode='operations'] retune (tokens.css:99-116), no matter which element it styled.
  // `@theme inline` instead inlines the var(--hv-*) REFERENCE into the generated utility, so
  // resolution happens at the styled element and follows its own [data-ui-mode] ancestor - exactly
  // like the two probe elements below, which resolve the same tokens directly via var() inside the
  // same operations wrapper Button renders into. Same probe-element pattern as
  // resolvedMinHeight/resolvedBorderRadius above, just anchored to an operations-mode wrapper
  // instead of document.body.
  it('resolves min-height and border-radius to the operations-mode control tokens', () => {
    const operationsWrapper = document.createElement('div');
    operationsWrapper.setAttribute('data-ui-mode', 'operations');
    document.body.append(operationsWrapper);

    try {
      const { unmount } = render(
        Button,
        { children: label('Operations sized') },
        { baseElement: operationsWrapper }
      );

      const button = screen.getByRole('button', { name: 'Operations sized' });
      const style = getComputedStyle(button);

      const heightProbe = document.createElement('div');
      heightProbe.style.minHeight = 'var(--hv-control-height)';
      operationsWrapper.append(heightProbe);

      const radiusProbe = document.createElement('div');
      radiusProbe.style.borderRadius = 'var(--hv-radius-control)';
      operationsWrapper.append(radiusProbe);

      const probeMinHeight = getComputedStyle(heightProbe).minHeight;
      const probeBorderRadius = getComputedStyle(radiusProbe).borderRadius;

      // The concrete operations-mode values (tokens.css:102-103), not just parity with the
      // probes: this pins the regression to the actual numbers rather than to a probe that could
      // drift in the same wrong direction as the utility it is meant to catch.
      expect(probeMinHeight).toBe('40px');
      expect(probeBorderRadius).toBe('4.8px');

      expect(style.minHeight).toBe(probeMinHeight);
      expect(style.borderRadius).toBe(probeBorderRadius);

      heightProbe.remove();
      radiusProbe.remove();
      unmount();
    } finally {
      operationsWrapper.remove();
    }
  });

  it('resolves font-weight to 800, matching .hv-control', () => {
    render(Button, { children: label('Weighted') });
    const style = getComputedStyle(screen.getByRole('button', { name: 'Weighted' }));
    expect(style.fontWeight).toBe('800');
  });

  it.each([
    ['neutral' as const, '--hv-color-snow-raised'],
    ['primary' as const, '--hv-color-basalt'],
    ['committed' as const, '--hv-color-signal']
  ])('resolves the %s background to its token', (intent, token) => {
    render(Button, { intent, children: label(intent) });
    const style = getComputedStyle(screen.getByRole('button', { name: intent }));
    expect(style.backgroundColor).toBe(resolvedBackground(token));
  });

  // The standard hover/active/cursor treatment Button now owns, codified from the idiom surveyed
  // at CheckInControl, FavouriteControl, and SuggestPlacePill call sites (see the `base` comment
  // in Button.svelte). Real :hover is not exercised here: synthetic pointer events do not drive
  // the browser's own :hover pseudo-class, so the hover/active gating below is asserted
  // structurally, against the exact generated utility classes, rather than by attempting a live
  // hover and reading a post-hover computed style.
  it('carries a pointer cursor while enabled', () => {
    render(Button, { children: label('Pointer') });
    const style = getComputedStyle(screen.getByRole('button', { name: 'Pointer' }));
    expect(style.cursor).toBe('pointer');
  });

  it('transitions the transform-family properties on the control tempo token', () => {
    render(Button, { children: label('Tempo') });
    const style = getComputedStyle(screen.getByRole('button', { name: 'Tempo' }));
    expect(style.transitionProperty).toContain('transform');
    expect(style.transitionTimingFunction).toBe(resolvedEaseSettle());
  });

  it('carries the hover-lift utility gated on not-disabled and not-aria-pressed', () => {
    render(Button, { children: label('Lift') });
    const classes = screen.getByRole('button', { name: 'Lift' }).className;
    expect(classes).toContain('not-disabled:not-aria-pressed:hover:-translate-y-px');
  });

  it('carries the active-squish utility gated on not-disabled', () => {
    render(Button, { children: label('Squish') });
    const classes = screen.getByRole('button', { name: 'Squish' }).className;
    expect(classes).toContain('not-disabled:active:scale-[0.97]');
  });

  it('carries the same hover/active/cursor utilities on the anchor render path', () => {
    render(Button, { href: '/place/1', children: label('Anchor treatment') });
    const link = screen.getByRole('link', { name: 'Anchor treatment' });
    const style = getComputedStyle(link);
    expect(style.cursor).toBe('pointer');
    expect(link.className).toContain('not-disabled:not-aria-pressed:hover:-translate-y-px');
    expect(link.className).toContain('not-disabled:active:scale-[0.97]');
  });
});
