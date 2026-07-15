import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import StarRating from '$lib/discovery/StarRating.svelte';

describe('StarRating', () => {
  it('moves focus and selection through every score with arrow keys', async () => {
    const onSelect = vi.fn();
    render(StarRating, {
      label: 'Heildareinkunn',
      value: 3,
      onSelect,
      scoreLabel: (score: number) => `${score} stjörnur`
    });
    const three = screen.getByRole('radio', { name: '3 stjörnur' });
    three.focus();

    await fireEvent.keyDown(three, { key: 'ArrowLeft' });
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });

    expect(onSelect.mock.calls.map(([score]) => score)).toEqual([2, 1]);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '1 stjörnur' }));
  });
});
