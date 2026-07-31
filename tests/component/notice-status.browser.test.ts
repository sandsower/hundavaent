import { Notice, Status } from '@hundavaent/design-system';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

// app.css is the app's real CSS entrypoint: it imports tokens.css and @hundavaent/design-system/theme.css
// (the Tailwind utility layer Notice/Status are built from). The legacy primitives.css stylesheet
// and its .hv-notice/.hv-status baseline are deleted, not merely empty - this is the same dual
// load button.browser.test.ts relies on for its own computed-style assertions.
import '../../src/app.css';

function label(text: string) {
  return createRawSnippet(() => ({ render: () => text }));
}

// Resolves a --hv-* custom property to its concrete computed value through the browser's own
// resolution, the same probe-element technique button.browser.test.ts uses, so assertions track
// the token rather than a literal that could silently drift out of sync with tokens.css.
function resolvedProperty(property: 'backgroundColor' | 'borderTopColor' | 'color', token: string) {
  const probe = document.createElement('div');
  const cssProperty =
    property === 'backgroundColor'
      ? 'backgroundColor'
      : property === 'borderTopColor'
        ? 'borderColor'
        : 'color';
  (probe.style as unknown as Record<string, string>)[cssProperty] = `var(${token})`;
  document.body.append(probe);
  const value = getComputedStyle(probe)[property];
  probe.remove();
  return value;
}

function resolvedBackground(token: string): string {
  return resolvedProperty('backgroundColor', token);
}

function resolvedBorderColor(token: string): string {
  return resolvedProperty('borderTopColor', token);
}

function resolvedTextColor(token: string): string {
  return resolvedProperty('color', token);
}

function resolvedBorderRadius(token: string): string {
  const probe = document.createElement('div');
  probe.style.borderRadius = `var(${token})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).borderRadius;
  probe.remove();
  return value;
}

function resolvedPadding(token: string): string {
  const probe = document.createElement('div');
  probe.style.padding = `var(${token})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).paddingTop;
  probe.remove();
  return value;
}

// The legacy-parity tests that rendered a live .hv-notice/.hv-status probe against the real
// primitives.css cascade retired with the rules themselves (phase 6 deleted the last legacy
// class users, so the baseline no longer existed to compare against; the by-then-empty
// primitives.css stylesheet was itself deleted in the follow-up pass). The direct
// token-resolution pins below are now the codification's contract - each resolves its token
// through a probe element, never a bare equality that could collapse to an inherited default.

describe('Notice', () => {
  it('resolves the untoned base to border-border-subtle and bg-fjord-soft', () => {
    render(Notice, { children: label('Untoned') });
    const style = getComputedStyle(screen.getByText('Untoned'));
    expect(style.borderTopColor).toBe(resolvedBorderColor('--hv-border-subtle'));
    expect(style.backgroundColor).toBe(resolvedBackground('--hv-color-fjord-soft'));
    expect(style.borderRadius).toBe(resolvedBorderRadius('--hv-radius-panel'));
    expect(style.paddingTop).toBe(resolvedPadding('--hv-space-panel'));
    expect(style.borderTopWidth).toBe('1px');
  });

  it.each([
    ['info' as const, '--hv-color-fjord', '--hv-color-fjord-soft'],
    ['verified' as const, '--hv-color-basalt', '--hv-color-signal-soft'],
    ['attention' as const, '--hv-color-danger', '--hv-color-danger-soft'],
    ['error' as const, '--hv-color-danger', '--hv-color-danger-soft'],
    ['success' as const, '--hv-color-success', '--hv-color-success-soft']
  ])('resolves the %s tone to its border/background pair', (tone, borderToken, bgToken) => {
    render(Notice, { tone, children: label(`Notice ${tone}`) });
    const style = getComputedStyle(screen.getByText(`Notice ${tone}`));
    expect(style.borderTopColor).toBe(resolvedBorderColor(borderToken));
    expect(style.backgroundColor).toBe(resolvedBackground(bgToken));
  });

  it.each([['attention' as const], ['error' as const], ['success' as const]])(
    'resolves the %s tone text color',
    (tone) => {
      const token = tone === 'success' ? '--hv-color-success' : '--hv-color-danger';
      render(Notice, { tone, children: label(`Text ${tone}`) });
      const style = getComputedStyle(screen.getByText(`Text ${tone}`));
      expect(style.color).toBe(resolvedTextColor(token));
    }
  );

  it('renders attention and error identically', () => {
    const { unmount: unmountAttention } = render(Notice, {
      tone: 'attention',
      children: label('Attention notice')
    });
    const attentionStyle = getComputedStyle(screen.getByText('Attention notice'));
    const attentionSnapshot = {
      border: attentionStyle.borderTopColor,
      background: attentionStyle.backgroundColor,
      color: attentionStyle.color
    };
    unmountAttention();

    render(Notice, { tone: 'error', children: label('Error notice') });
    const errorStyle = getComputedStyle(screen.getByText('Error notice'));
    expect(errorStyle.borderTopColor).toBe(attentionSnapshot.border);
    expect(errorStyle.backgroundColor).toBe(attentionSnapshot.background);
    expect(errorStyle.color).toBe(attentionSnapshot.color);
  });

  it('renders a div by default', () => {
    render(Notice, { children: label('Default element') });
    expect(screen.getByText('Default element').tagName).toBe('DIV');
  });

  it.each([['p' as const], ['section' as const], ['li' as const]])(
    'renders as the given %s element',
    (as) => {
      render(Notice, { as, children: label(`As ${as}`) });
      expect(screen.getByText(`As ${as}`).tagName).toBe(as.toUpperCase());
    }
  );

  it('does not default a role, leaving it caller-owned', () => {
    render(Notice, { children: label('No role') });
    expect(screen.getByText('No role').hasAttribute('role')).toBe(false);
  });

  it('passes rest props such as role and aria attributes through', () => {
    render(Notice, {
      tone: 'error',
      role: 'alert',
      'aria-live': 'assertive',
      children: label('Rest props')
    });
    // role="alert" has no accessible name computed from its own content per ARIA, so
    // getByRole(..., { name }) cannot match it here - assert via getByRole alone (there is only
    // one alert on the page) plus the text content and the other rest prop landing alongside it.
    const notice = screen.getByRole('alert');
    expect(notice.textContent?.trim()).toBe('Rest props');
    expect(notice.getAttribute('aria-live')).toBe('assertive');
  });

  it('merges a caller class alongside its own generated classes, appended last', () => {
    render(Notice, { class: 'call-site-hook', children: label('Glued notice') });
    const classes = screen.getByText('Glued notice').className.trim().split(/\s+/);
    expect(classes).toContain('rounded-panel');
    expect(classes.at(-1)).toBe('call-site-hook');
  });

  it('renders its children snippet as the only content', () => {
    render(Notice, { children: label('Exact notice content') });
    expect(screen.getByText('Exact notice content').textContent?.trim()).toBe(
      'Exact notice content'
    );
  });
});

describe('Status', () => {
  it('resolves the untoned base to border-border-strong, bg-fjord-soft, and the fixed padding', () => {
    render(Status, { children: label('Untoned chip') });
    const style = getComputedStyle(screen.getByText('Untoned chip'));
    expect(style.borderTopColor).toBe(resolvedBorderColor('--hv-border-strong'));
    expect(style.backgroundColor).toBe(resolvedBackground('--hv-color-fjord-soft'));
    expect(style.borderRadius).toBe(resolvedBorderRadius('--hv-radius-control'));
    expect(style.paddingTop).toBe('4.8px');
    expect(style.paddingLeft).toBe('8px');
    expect(style.fontWeight).toBe('800');
    expect(style.fontSize).toBe('12px');
    expect(style.display).toBe('inline-block');
  });

  it('renders as a span', () => {
    render(Status, { children: label('Span check') });
    expect(screen.getByText('Span check').tagName).toBe('SPAN');
  });

  it.each([
    ['verified' as const, '--hv-color-signal', '--hv-color-basalt'],
    ['selected' as const, '--hv-color-signal', '--hv-color-basalt'],
    ['success' as const, '--hv-color-success-soft', '--hv-color-success'],
    ['error' as const, '--hv-color-danger-soft', '--hv-color-danger'],
    ['attention' as const, '--hv-color-danger-soft', '--hv-color-danger']
  ])('resolves the %s tone to its background/text pair', (tone, bgToken, textToken) => {
    render(Status, { tone, children: label(`Status ${tone}`) });
    const style = getComputedStyle(screen.getByText(`Status ${tone}`));
    expect(style.backgroundColor).toBe(resolvedBackground(bgToken));
    expect(style.color).toBe(resolvedTextColor(textToken));
  });

  it('renders verified and selected identically', () => {
    const { unmount: unmountVerified } = render(Status, {
      tone: 'verified',
      children: label('Verified status')
    });
    const verifiedStyle = getComputedStyle(screen.getByText('Verified status'));
    const verifiedSnapshot = {
      background: verifiedStyle.backgroundColor,
      color: verifiedStyle.color
    };
    unmountVerified();

    render(Status, { tone: 'selected', children: label('Selected status') });
    const selectedStyle = getComputedStyle(screen.getByText('Selected status'));
    expect(selectedStyle.backgroundColor).toBe(verifiedSnapshot.background);
    expect(selectedStyle.color).toBe(verifiedSnapshot.color);
  });

  it('renders error and attention identically', () => {
    const { unmount: unmountError } = render(Status, {
      tone: 'error',
      children: label('Error status')
    });
    const errorStyle = getComputedStyle(screen.getByText('Error status'));
    const errorSnapshot = { background: errorStyle.backgroundColor, color: errorStyle.color };
    unmountError();

    render(Status, { tone: 'attention', children: label('Attention status') });
    const attentionStyle = getComputedStyle(screen.getByText('Attention status'));
    expect(attentionStyle.backgroundColor).toBe(errorSnapshot.background);
    expect(attentionStyle.color).toBe(errorSnapshot.color);
  });

  it('passes rest props through', () => {
    render(Status, { 'data-testid': 'chip', children: label('Rest status') });
    expect(screen.getByText('Rest status').getAttribute('data-testid')).toBe('chip');
  });

  it('merges a caller class alongside its own generated classes, appended last', () => {
    render(Status, { class: 'call-site-hook', children: label('Glued status') });
    const classes = screen.getByText('Glued status').className.trim().split(/\s+/);
    expect(classes).toContain('rounded-control');
    expect(classes.at(-1)).toBe('call-site-hook');
  });

  it('renders its children snippet as the only content', () => {
    render(Status, { children: label('Exact status content') });
    expect(screen.getByText('Exact status content').textContent?.trim()).toBe(
      'Exact status content'
    );
  });
});
