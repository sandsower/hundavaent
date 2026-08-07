import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import WheelchairAccessibilityBadge from '$lib/discovery/WheelchairAccessibilityBadge.svelte';

// app.css supplies the real token values (tokens.css). The contrast assertions below used to be
// satisfied by the hardcoded hex fallbacks the component carried in its var() references - the
// phase 5 sweep removed those as drift risk, so the test now measures the same token-driven
// rendering the app ships instead of a shadow copy that could silently diverge from it.
import '../../src/app.css';

function resolvedBackground(customProperty: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = `var(${customProperty})`;
  document.body.append(probe);
  const background = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return background;
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = color
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number)
      .map((channel) => (color.startsWith('color(srgb ') ? channel : channel / 255))
      .map((channel) =>
        channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      );
    if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${color}`);
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('WheelchairAccessibilityBadge', () => {
  it('renders unknown as an explicit, static mobility fact', () => {
    const { container } = render(WheelchairAccessibilityBadge, {
      state: 'unknown',
      copy: catalogues.en
    });

    expect(screen.getByText('Accessibility unknown')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    const badge = container.querySelector<HTMLElement>('[data-wheelchair-accessibility="unknown"]');
    expect(badge).toBeTruthy();
    expect(getComputedStyle(badge!).backgroundColor).toBe(
      resolvedBackground('--hv-access-unknown')
    );
    expect(container.querySelector('[data-wheelchair-modifier="unknown"]')?.textContent).toBe('?');
  });

  it('uses the plain wheelchair pictogram for the accessible state', () => {
    const { container } = render(WheelchairAccessibilityBadge, {
      state: 'accessible',
      copy: catalogues.en
    });

    const badge = container.querySelector<HTMLElement>(
      '[data-wheelchair-accessibility="accessible"]'
    );
    expect(screen.getByText('Wheelchair accessible')).toBeTruthy();
    expect(getComputedStyle(badge!).backgroundColor).toBe(
      resolvedBackground('--hv-color-moss-soft')
    );
    expect(container.querySelector('[data-wheelchair-modifier]')).toBeNull();
  });

  it('uses a diagonal prohibition mark for the not-accessible state', () => {
    const { container } = render(WheelchairAccessibilityBadge, {
      state: 'not_accessible',
      copy: catalogues.en
    });

    const badge = container.querySelector<HTMLElement>(
      '[data-wheelchair-accessibility="not_accessible"]'
    );
    expect(screen.getByText('Not wheelchair accessible')).toBeTruthy();
    expect(getComputedStyle(badge!).backgroundColor).toBe(
      resolvedBackground('--hv-color-danger-soft')
    );
    expect(container.querySelector('[data-wheelchair-modifier="not_accessible"]')).toBeTruthy();
  });

  it('marks the partially accessible state with a half modifier', () => {
    const { container } = render(WheelchairAccessibilityBadge, {
      state: 'partially_accessible',
      copy: catalogues.en
    });

    const badge = container.querySelector<HTMLElement>(
      '[data-wheelchair-accessibility="partially_accessible"]'
    );
    expect(screen.getByText('Partially wheelchair accessible')).toBeTruthy();
    expect(getComputedStyle(badge!).backgroundColor).toBe(
      resolvedBackground('--hv-access-special')
    );
    expect(
      container.querySelector('[data-wheelchair-modifier="partially_accessible"]')?.textContent
    ).toBe('½');
  });

  it.each(['accessible', 'partially_accessible', 'not_accessible', 'unknown'] as const)(
    'meets WCAG AA text contrast for %s',
    (state) => {
      const { container } = render(WheelchairAccessibilityBadge, {
        state,
        copy: catalogues.en
      });
      const badge = container.querySelector<HTMLElement>(
        `[data-wheelchair-accessibility="${state}"]`
      );

      expect(badge).toBeTruthy();
      const style = getComputedStyle(badge!);
      expect(
        contrastRatio(style.color, style.backgroundColor),
        `${style.color} on ${style.backgroundColor}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  );

  it('expands into the explanation panel when rendered as a disclosure', async () => {
    const { container } = render(WheelchairAccessibilityBadge, {
      state: 'partially_accessible',
      copy: catalogues.en,
      expandable: true
    });

    const chip = screen.getByRole('button', { name: 'Partially wheelchair accessible' });
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-wheelchair-detail]')).toBeNull();

    await fireEvent.click(chip);

    expect(chip.getAttribute('aria-expanded')).toBe('true');
    const panel = container.querySelector('[data-wheelchair-detail]');
    expect(panel?.textContent).toContain(
      catalogues.en['wheelchairAccessibility.partiallyAccessibleDetail']
    );
    expect(chip.getAttribute('aria-controls')).toBe(panel?.id);

    await fireEvent.click(chip);

    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-wheelchair-detail]')).toBeNull();
  });

  it('stays a static badge when not expandable, exactly as the list card renders it', () => {
    render(WheelchairAccessibilityBadge, {
      state: 'partially_accessible',
      copy: catalogues.en
    });

    expect(screen.queryByRole('button')).toBeNull();
  });
});
