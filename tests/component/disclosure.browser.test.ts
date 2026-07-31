import { Disclosure } from '@hundavaent/design-system';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, type Snippet } from 'svelte';
import { describe, expect, it } from 'vitest';

// app.css is the app's real CSS entrypoint: it imports tokens.css and @hundavaent/design-system/theme.css
// (the Tailwind utility layer Disclosure is built from). The legacy primitives.css stylesheet and
// its .hv-disclosure baseline are deleted, not merely empty - this is the same dual load
// button.browser.test.ts and notice-status.browser.test.ts rely on for their own assertions.
import '../../src/app.css';

function label(text: string) {
  return createRawSnippet(() => ({ render: () => text }));
}

describe('Disclosure', () => {
  it('renders closed by default and toggles open/closed on summary clicks', async () => {
    const { container } = render(Disclosure, {
      props: { summary: label('Practical details'), children: label('Body content') }
    });

    const details = container.querySelector('details');
    expect(details?.open).toBe(false);

    const summary = container.querySelector('summary');
    if (!summary) throw new Error('summary not found');

    await fireEvent.click(summary);
    expect(details?.open).toBe(true);

    await fireEvent.click(summary);
    expect(details?.open).toBe(false);
  });

  // Pins the element-ref contract: `element` is `$bindable`, bound to the real <details> via
  // bind:this inside the component, so a caller reading/writing `.open` on the bound value talks
  // to the same live DOM node the browser renders - exactly the shape SelectedPlaceCard's own
  // `completeDetails` ref already relies on. Two-way binding is exercised here without a compiled
  // Svelte parent by handing `render` a props object whose `element` property is a plain
  // getter/setter pair: Svelte's compiled bind:this write lands as an ordinary property
  // assignment on the props object it was mounted with, which this accessor observes directly.
  it('exposes the real HTMLDetailsElement through the bindable element prop', () => {
    let boundElement: HTMLDetailsElement | undefined;
    const props: { summary: Snippet; children: Snippet; element?: HTMLDetailsElement } = {
      summary: label('Practical details'),
      children: label('Body content')
    };
    Object.defineProperty(props, 'element', {
      enumerable: true,
      configurable: true,
      get: () => boundElement,
      set: (value: HTMLDetailsElement | undefined) => {
        boundElement = value;
      }
    });

    const { container } = render(Disclosure, { props });

    expect(boundElement).toBeInstanceOf(HTMLDetailsElement);
    expect(boundElement).toBe(container.querySelector('details'));

    boundElement!.open = true;
    expect(container.querySelector('details')?.open).toBe(true);
  });

  it('passes rest props such as data attributes through to the details element', () => {
    const { container } = render(Disclosure, {
      props: {
        summary: label('Practical details'),
        children: label('Body content'),
        'data-testid': 'place-details'
      }
    });

    expect(container.querySelector('details')?.getAttribute('data-testid')).toBe('place-details');
  });

  it('renders the summary snippet content and an aria-hidden chevron after it', () => {
    render(Disclosure, {
      props: { summary: label('Practical details'), children: label('Body content') }
    });

    const summaryText = screen.getByText('Practical details');
    expect(summaryText.closest('summary')).not.toBeNull();

    const chevron = summaryText.closest('summary')?.querySelector('svg');
    expect(chevron).not.toBeNull();
    expect(chevron?.getAttribute('aria-hidden')).toBe('true');
    expect(chevron?.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it('renders the children snippet as the details body content', () => {
    render(Disclosure, {
      props: { summary: label('Practical details'), children: label('Body content') }
    });

    expect(screen.getByText('Body content')).toBeTruthy();
  });

  // Pins the codification itself (the reason this file loads app.css): the retired
  // .hv-disclosure treatment - 1px top border, fjord weight-850 pointer summary - must survive
  // as rendered style, not just as class strings. Token resolution goes through a probe element
  // with a not-the-inherited-default guard so the pin cannot pass vacuously if tokens ever stop
  // loading in this harness.
  it('carries the codified .hv-disclosure treatment as rendered style', () => {
    const { container } = render(Disclosure, {
      props: { summary: label('Practical details'), children: label('Body content') }
    });

    const details = container.querySelector('details');
    const summary = container.querySelector('summary');
    if (!details || !summary) throw new Error('details/summary not found');

    const probe = document.createElement('span');
    probe.style.color = 'var(--hv-color-fjord)';
    document.body.append(probe);
    const fjord = getComputedStyle(probe).color;
    const inherited = getComputedStyle(document.body).color;
    probe.remove();

    expect(fjord).not.toBe(inherited);
    expect(getComputedStyle(details).borderTopWidth).toBe('1px');
    expect(getComputedStyle(summary).color).toBe(fjord);
    expect(getComputedStyle(summary).fontWeight).toBe('850');
    expect(getComputedStyle(summary).cursor).toBe('pointer');
  });
});
