import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import AccessSymbols from '$lib/discovery/AccessSymbols.svelte';

const simpleCondition = {
  accessArea: 'indoors' as const,
  restraintCondition: 'leash_required' as const,
  permissionRequirement: 'standing_permission' as const,
  dogEligibility: { scope: 'all_dogs' as const },
  availabilityState: 'not_stated' as const,
  availabilityWindow: {}
};

describe('AccessSymbols', () => {
  it('renders five labelled controls and keeps activated details visible', async () => {
    render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition],
      copy: catalogues.en
    });

    expect(screen.getByLabelText('Dog access at Brikk')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(5);
    const timing = screen.getByRole('button', { name: 'Information not stated' });
    await fireEvent.click(timing);
    expect(timing.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('does not imply permission');
  });

  it('shows a single special-condition control for complex access', async () => {
    const onOpenDetails = vi.fn();
    render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition, { ...simpleCondition, accessArea: 'outdoors' as const }],
      copy: catalogues.en,
      onOpenDetails
    });

    const control = screen.getByRole('button', { name: /Different conditions apply/ });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await fireEvent.click(control);
    expect(onOpenDetails).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toContain('2 different access conditions');
  });
});
