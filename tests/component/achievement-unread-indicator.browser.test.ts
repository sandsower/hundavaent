import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import AchievementUnreadIndicator from '$lib/achievements/AchievementUnreadIndicator.svelte';

describe('AchievementUnreadIndicator', () => {
  it('renders an in-flow numberless paw cue with an explicit text label', () => {
    const view = render(AchievementUnreadIndicator, {
      visible: true,
      label: 'New achievement waiting'
    });

    const indicator = view.container.querySelector('[data-achievement-unread-indicator]');
    const accessibleLabel = screen.getByText('New achievement waiting');
    expect(indicator).toBeTruthy();
    expect(indicator && getComputedStyle(indicator).position).not.toBe('absolute');
    expect(getComputedStyle(accessibleLabel).position).toBe('absolute');
    expect(indicator?.textContent).not.toMatch(/\d/);
  });

  it('renders nothing after the achievement has been acknowledged', () => {
    const view = render(AchievementUnreadIndicator, {
      visible: false,
      label: 'New achievement waiting'
    });

    expect(view.container.querySelector('[data-achievement-unread-indicator]')).toBeNull();
    expect(screen.queryByText('New achievement waiting')).toBeNull();
  });
});
