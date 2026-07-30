import { Eyebrow, Meta, PageHeader, PageShell, PageTitle, Panel } from '@hundavaent/design-system';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

// Same rationale as button.browser.test.ts: app.css pulls in tokens.css and the design-system
// utility layer, so computed-style assertions below compare against the live tokens.
import '../../src/app.css';

// createRawSnippet render() needs a single root element, so every child is wrapped in a span.
const child = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));

// Probe-element token resolution, the button.browser.test.ts pattern: parity with the token,
// never a hardcoded literal that drifts when tokens.css changes.
function resolvedProperty(property: string, value: string): string {
  const probe = document.createElement('div');
  probe.style.setProperty(property, value);
  document.body.append(probe);
  const resolved = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return resolved;
}

describe('PageShell', () => {
  it('renders a main landmark carrying the ui mode for descendants still on hv-* primitives', () => {
    const { container } = render(PageShell, { props: { children: child('Body') } });

    const shell = container.querySelector('main');
    expect(shell).not.toBeNull();
    expect(shell?.dataset.uiMode).toBe('place');
  });

  it('emits the requested mode so the operations token retune reaches its subtree', () => {
    const { container } = render(PageShell, {
      props: { mode: 'operations', children: child('Queue') }
    });

    expect(container.querySelector('main')?.dataset.uiMode).toBe('operations');
  });

  it('constrains a narrow shell below the wide content container', () => {
    const { container } = render(PageShell, {
      props: { width: 'narrow', as: 'div', children: child('Narrow') }
    });

    const shell = container.querySelector('div[data-ui-mode]');
    expect(shell).not.toBeNull();
    // --hv-content-narrow is 42rem = 672px; the min() picks it or the viewport-derived value,
    // both strictly below the wide container's 72rem.
    expect(Number.parseFloat(getComputedStyle(shell as Element).width)).toBeLessThanOrEqual(672);
  });

  it('carries the section rhythm as its own top padding', () => {
    const { container } = render(PageShell, { props: { children: child('Body') } });

    const shell = container.querySelector('main');
    expect(shell).not.toBeNull();
    expect(getComputedStyle(shell as Element).paddingBlockStart).toBe(
      resolvedProperty('padding-block-start', 'var(--hv-space-section)')
    );
  });
});

describe('PageHeader', () => {
  it('spaces its bands at the panel rhythm - the 8px/16px split resolution', () => {
    const { container } = render(PageHeader, { props: { children: child('Heading') } });

    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    const style = getComputedStyle(header as Element);
    expect(style.display).toBe('grid');
    expect(style.rowGap).toBe(resolvedProperty('row-gap', 'var(--hv-space-panel)'));
  });
});

describe('text primitives', () => {
  it('Eyebrow renders zero-margin uppercase fjord text on any element', () => {
    const { container } = render(Eyebrow, {
      props: { as: 'h3', children: child('Section') }
    });

    const eyebrow = container.querySelector('h3');
    expect(eyebrow).not.toBeNull();
    const style = getComputedStyle(eyebrow as Element);
    expect(style.textTransform).toBe('uppercase');
    expect(style.marginBlockStart).toBe('0px');
    expect(style.color).toBe(resolvedProperty('color', 'var(--hv-color-fjord)'));
  });

  it('PageTitle renders the display serif at zero margin', () => {
    const { container } = render(PageTitle, { props: { children: child('Places') } });

    const title = container.querySelector('h1');
    expect(title).not.toBeNull();
    const style = getComputedStyle(title as Element);
    expect(style.marginBlockStart).toBe('0px');
    expect(style.marginBlockEnd).toBe('0px');
    expect(style.fontFamily).toBe(resolvedProperty('font-family', 'var(--hv-font-display)'));
  });

  it('Meta renders muted supporting text and accepts the small element', () => {
    const { container } = render(Meta, {
      props: { as: 'small', children: child('Saved earlier') }
    });

    const meta = container.querySelector('small');
    expect(meta).not.toBeNull();
    expect(getComputedStyle(meta as Element).color).toBe(
      resolvedProperty('color', 'var(--hv-color-basalt-muted)')
    );
  });
});

describe('Panel', () => {
  it('renders the raised surface treatment without padding by default', () => {
    const { container } = render(Panel, { props: { children: child('Card') } });

    const panel = container.querySelector('div');
    expect(panel).not.toBeNull();
    const style = getComputedStyle(panel as Element);
    expect(style.borderStyle).toBe('solid');
    expect(style.paddingBlockStart).toBe('0px');
    expect(style.backgroundColor).toBe(
      resolvedProperty('background-color', 'var(--hv-color-snow-raised)')
    );
  });

  it('padded panels take the panel inset, following the mode the ancestor sets', () => {
    const { container } = render(Panel, {
      props: { padded: true, as: 'li', children: child('Entry') }
    });

    const panel = container.querySelector('li');
    expect(panel).not.toBeNull();
    expect(getComputedStyle(panel as Element).paddingBlockStart).toBe(
      resolvedProperty('padding-block-start', 'var(--hv-space-panel)')
    );
  });

  it('retunes the padded inset when it sits inside an operations shell', () => {
    // The behavior PageShell's unconditional data-ui-mode exists to serve: utilities carry the
    // var() reference to the element (the @theme inline doctrine), so the operations retune of
    // --hv-space-panel (1rem -> 0.75rem) must reach a padded Panel through the shell boundary.
    const host = document.createElement('div');
    host.dataset.uiMode = 'operations';
    document.body.append(host);
    try {
      const probe = document.createElement('div');
      probe.style.setProperty('padding-block-start', 'var(--hv-space-panel)');
      host.append(probe);
      const expected = getComputedStyle(probe).getPropertyValue('padding-block-start');
      probe.remove();

      render(Panel, {
        props: { padded: true, children: child('Queue row') },
        target: host
      });

      const panel = host.querySelector('div.rounded-panel') ?? host.firstElementChild;
      expect(panel).not.toBeNull();
      expect(getComputedStyle(panel as Element).paddingBlockStart).toBe(expected);
      // And the retune is real: the operations inset differs from the Member-mode one.
      expect(expected).not.toBe(resolvedProperty('padding-block-start', 'var(--hv-space-panel)'));
    } finally {
      host.remove();
    }
  });
});
