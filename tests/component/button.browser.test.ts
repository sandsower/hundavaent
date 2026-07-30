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

function resolvedBorderColor(token: string): string {
  const probe = document.createElement('div');
  probe.style.borderColor = `var(${token})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).borderColor;
  probe.remove();
  return value;
}

function resolvedTextColor(token: string): string {
  const probe = document.createElement('div');
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

function resolvedControlHeight(): string {
  const probe = document.createElement('div');
  probe.style.height = 'var(--hv-control-height)';
  document.body.append(probe);
  const value = getComputedStyle(probe).height;
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

  it.each([
    ['quiet' as const, ['border-fjord', 'bg-snow-raised', 'text-fjord']],
    ['danger' as const, ['border-danger', 'bg-danger', 'text-snow-raised']],
    ['danger-quiet' as const, ['border-danger', 'bg-snow-raised', 'text-danger']]
  ])('applies the %s intent as a single matched border/background/text triple', (intent, expected) => {
    render(Button, { intent, children: label(intent) });
    const classes = screen.getByRole('button', { name: intent }).classList;
    for (const expectedClass of expected) {
      expect(classes.contains(expectedClass)).toBe(true);
    }
  });

  // Phase 6's three new intents: quiet (the fjord-outline back-link/secondary treatment),
  // danger (moderation's filled destructive flavour), and danger-quiet (the account-deletion /
  // correction-controls outline flavour). Each assertion below resolves its expected token through
  // an independent probe (never a literal colour), then guards against the vacuous-pin failure
  // mode from phase 5: it first proves the expected token differs from document.body's own
  // inherited/initial default for that property, so a Button whose intent utilities silently
  // failed to apply - and therefore fell back to that same default - could not pass by collapsing
  // to the same value as the expectation.
  it.each([
    ['quiet' as const, '--hv-color-fjord', '--hv-color-snow-raised', '--hv-color-fjord'],
    ['danger' as const, '--hv-color-danger', '--hv-color-danger', '--hv-color-snow-raised'],
    ['danger-quiet' as const, '--hv-color-danger', '--hv-color-snow-raised', '--hv-color-danger']
  ])(
    'resolves the %s intent to its border/background/text token triple',
    (intent, borderToken, backgroundToken, textToken) => {
      render(Button, { intent, children: label(intent) });
      const style = getComputedStyle(screen.getByRole('button', { name: intent }));

      const expectedBorder = resolvedBorderColor(borderToken);
      const expectedBackground = resolvedBackground(backgroundToken);
      const expectedText = resolvedTextColor(textToken);
      const defaultBorder = getComputedStyle(document.body).borderColor;
      const defaultBackground = getComputedStyle(document.body).backgroundColor;
      const defaultText = getComputedStyle(document.body).color;

      expect(expectedBorder).not.toBe(defaultBorder);
      expect(expectedBackground).not.toBe(defaultBackground);
      expect(expectedText).not.toBe(defaultText);

      expect(style.borderColor).toBe(expectedBorder);
      expect(style.backgroundColor).toBe(expectedBackground);
      expect(style.color).toBe(expectedText);
    }
  );

  // shape="round": rounded-full, a square tied to --hv-control-height, and zero padding.
  it('resolves shape="round" to a fully-round radius, a control-height square, and zero padding', () => {
    render(Button, { shape: 'round', 'aria-label': 'Round', children: label('R') });
    const style = getComputedStyle(screen.getByRole('button', { name: 'Round' }));

    const fullRadiusProbe = document.createElement('div');
    fullRadiusProbe.className = 'rounded-full';
    document.body.append(fullRadiusProbe);
    const fullRadius = getComputedStyle(fullRadiusProbe).borderRadius;
    fullRadiusProbe.remove();

    // Guard against the vacuous-pin class: rounded-control's own radius (999px, tokens.css) already
    // reads as fully round on a small square, so a bare equality between the round Button's radius
    // and rounded-full's radius would not catch a Button that silently stayed on the default shape.
    // Comparing against the pill shape's own resolved radius proves the two are genuinely different
    // values, not two paths that happen to look the same.
    expect(fullRadius).not.toBe(resolvedBorderRadius());
    expect(style.borderRadius).toBe(fullRadius);

    const controlHeight = resolvedControlHeight();
    expect(style.width).toBe(controlHeight);
    expect(style.height).toBe(controlHeight);
    expect(style.padding).toBe('0px');
  });

  it('never carries two border-colour utilities at once for round + neutral', () => {
    render(Button, {
      shape: 'round',
      intent: 'neutral',
      'aria-label': 'Solo border',
      children: label('N')
    });
    const classes = screen.getByRole('button', { name: 'Solo border' }).classList;
    expect(classes.contains('border-border-subtle')).toBe(true);
    expect(classes.contains('border-border-strong')).toBe(false);
  });

  it('renders round + neutral with the subtle border token, not the strong one', () => {
    render(Button, {
      shape: 'round',
      intent: 'neutral',
      'aria-label': 'Subtle border',
      children: label('N')
    });
    const style = getComputedStyle(screen.getByRole('button', { name: 'Subtle border' }));

    const subtleBorder = resolvedBorderColor('--hv-border-subtle');
    const strongBorder = resolvedBorderColor('--hv-border-strong');

    // Guard against the vacuous-pin class: prove the subtle and strong border tokens actually
    // resolve to different colours before trusting the "not strong" half of this test - if they
    // ever collapsed to the same value, a Button that kept the strong border would pass anyway.
    expect(subtleBorder).not.toBe(strongBorder);
    expect(style.borderColor).toBe(subtleBorder);
    expect(style.borderColor).not.toBe(strongBorder);
  });

  it('renders shape="round" as an anchor with the same geometry as the button when href is given', () => {
    const { unmount } = render(Button, {
      shape: 'round',
      'aria-label': 'Round button',
      children: label('B')
    });
    const buttonStyle = getComputedStyle(screen.getByRole('button', { name: 'Round button' }));
    const buttonGeometry = {
      width: buttonStyle.width,
      height: buttonStyle.height,
      borderRadius: buttonStyle.borderRadius,
      padding: buttonStyle.padding
    };
    unmount();

    render(Button, {
      shape: 'round',
      href: '/place/1',
      'aria-label': 'Round link',
      children: label('L')
    });
    const link = screen.getByRole('link', { name: 'Round link' });
    expect(link.tagName).toBe('A');
    const linkStyle = getComputedStyle(link);
    expect(linkStyle.width).toBe(buttonGeometry.width);
    expect(linkStyle.height).toBe(buttonGeometry.height);
    expect(linkStyle.borderRadius).toBe(buttonGeometry.borderRadius);
    expect(linkStyle.padding).toBe(buttonGeometry.padding);
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
