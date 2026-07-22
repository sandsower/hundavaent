import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import WheelchairAccessibilityBadge from '$lib/discovery/WheelchairAccessibilityBadge.svelte';

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
    expect(container.querySelector('[data-wheelchair-accessibility="unknown"]')).toBeTruthy();
    expect(container.querySelector('[data-wheelchair-modifier="unknown"]')?.textContent).toBe('?');
  });

  it('uses the plain wheelchair pictogram for the accessible state', () => {
    const { container } = render(WheelchairAccessibilityBadge, {
      state: 'accessible',
      copy: catalogues.en
    });

    expect(screen.getByText('Wheelchair accessible')).toBeTruthy();
    expect(container.querySelector('[data-wheelchair-modifier]')).toBeNull();
  });

  it('uses a diagonal prohibition mark for the not-accessible state', () => {
    const { container } = render(WheelchairAccessibilityBadge, {
      state: 'not_accessible',
      copy: catalogues.en
    });

    expect(screen.getByText('Not wheelchair accessible')).toBeTruthy();
    expect(container.querySelector('[data-wheelchair-modifier="not_accessible"]')).toBeTruthy();
  });

  it.each(['accessible', 'not_accessible', 'unknown'] as const)(
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
});
