import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../src/app.css';
import { catalogues } from '$i18n';
import CheckInControl from '$lib/check-ins/CheckInControl.svelte';
import type { ProximityPlace } from '$lib/check-ins/proximity';
import PlaceCard from '$lib/discovery/PlaceCard.svelte';
import StarRating from '$lib/discovery/StarRating.svelte';

const { captureAnalytics } = vi.hoisted(() => ({ captureAnalytics: vi.fn() }));

vi.mock('$lib/analytics/posthog', () => ({
  postHogAnalytics: { capture: captureAnalytics }
}));

afterEach(() => {
  captureAnalytics.mockClear();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const placeId = '30000000-0000-4000-8000-000000000003';
const place = {
  placeId,
  name: 'Published Place',
  category: 'park' as const,
  locality: 'Reykjavík',
  latitude: 64.1423,
  longitude: -21.9555,
  wheelchairAccessibility: 'accessible' as const,
  accessConditionCount: 1,
  simpleAccessSummary: true,
  accessArea: 'outdoors' as const,
  restraintCondition: 'leash_required' as const,
  permissionRequirement: 'standing_permission' as const,
  accessConditions: [
    {
      accessArea: 'outdoors' as const,
      restraintCondition: 'leash_required' as const,
      permissionRequirement: 'standing_permission' as const
    }
  ],
  primaryPhoto: null
};

function renderCard(overrides: { selected?: boolean; interactive?: boolean } = {}): HTMLElement {
  render(PlaceCard, {
    place,
    lang: 'en',
    copy: catalogues.en,
    selected: overrides.selected ?? false,
    interactive: overrides.interactive ?? true
  });
  // The most recent render: cleanup runs between tests, not between renders within one.
  const card = [...document.querySelectorAll<HTMLElement>('[data-place-card]')].at(-1);
  if (!card) throw new Error('PlaceCard did not render');
  return card;
}

/** The factor a computed transform matrix applies on the Y axis, or null when there is none. */
function verticalScale(transform: string): number | null {
  const values = transform.match(/^matrix\(([^)]+)\)$/);
  if (!values) return null;
  return Number.parseFloat(values[1].split(',')[3]);
}

describe('PlaceCard motion', () => {
  it('opts its subtree out of the blanket reduced-motion reset', () => {
    // Without this, the app.css reset flattens the card's own tokens to 0.01ms and takes the
    // selection bar's legibility down with the movement it was meant to suppress.
    expect(renderCard().dataset.motion).toBe('tokenized');
  });

  it('carries the selection bar on a transform rather than an inset shadow', () => {
    const card = renderCard();
    const bar = getComputedStyle(card, '::before');

    // The bar used to be `box-shadow: inset 0.3rem 0 0`, which cannot move without repainting
    // the whole card on every selection change in a scrolling list.
    expect(getComputedStyle(card).boxShadow).toBe('none');
    expect(verticalScale(bar.transform)).toBe(0);
    expect(bar.transitionProperty).toContain('transform');
  });

  it('wipes the bar open when the card is the selected one', () => {
    const bar = getComputedStyle(renderCard({ selected: true }), '::before');

    expect(verticalScale(bar.transform)).toBe(1);
  });

  it('promises a press only on a card that can be opened', () => {
    // A non-interactive card renders a static summary with nothing to activate. Lifting it
    // under the cursor would advertise an interaction that does not exist.
    expect(renderCard({ interactive: true }).dataset.interactive).toBe('true');
    expect(renderCard({ interactive: false }).dataset.interactive).toBe('false');
  });
});

describe('StarRating cascade', () => {
  const scoreLabel = (score: number) => `${score} stars`;
  const base = { label: 'Overall', onSelect: vi.fn(), scoreLabel };

  function stars(): HTMLElement[] {
    return screen.getAllByRole('radio');
  }

  function popped(): string[] {
    return stars()
      .filter((star) => star.classList.contains('pop-a') || star.classList.contains('pop-b'))
      .map((star) => star.getAttribute('aria-label') ?? '');
  }

  it('leaves a score that arrived with the page unanimated', () => {
    render(StarRating, { ...base, value: 4 });

    // Recognition belongs to the moment of choosing, exactly as it does for the Favourite heart.
    expect(popped()).toEqual([]);
  });

  it('pops every filled star and no empty one, cascading left to right', async () => {
    const { rerender } = render(StarRating, { ...base, value: null });

    await fireEvent.click(screen.getByRole('radio', { name: '3 stars' }));
    await rerender({ ...base, value: 3 });

    expect(popped()).toEqual(['1 stars', '2 stars', '3 stars']);
    // The stagger is a token multiplied by position rather than a picked delay, so it collapses
    // with the rest of the motion family under reduced motion instead of surviving as a pause.
    expect(stars().map((star) => star.style.getPropertyValue('--star-position'))).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4'
    ]);
  });

  it('restarts the pop when the score changes again mid-cascade', async () => {
    const { rerender } = render(StarRating, { ...base, value: null });

    await fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));
    await rerender({ ...base, value: 2 });
    const first = stars()[0].className;

    await fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    await rerender({ ...base, value: 4 });

    // Re-adding a class an element already wears does not restart its animation, so arrow-key
    // navigation through the scores would otherwise land silently after the first press.
    expect(stars()[0].className).not.toBe(first);
    expect(popped()).toHaveLength(4);
  });
});

describe('CheckInControl arrival', () => {
  const placeName = 'Published Place';
  const proximityPlace: ProximityPlace = {
    category: 'park',
    location: { latitude: 64.146, longitude: -21.942 }
  };
  const base = {
    placeId,
    placeName,
    place: proximityPlace,
    lang: 'en' as const,
    copy: catalogues.en,
    signedIn: true,
    signInHref: '/en/account',
    proximityAssistEnabled: false
  };

  it('does not replay the arrival for a check-in loaded with the page', () => {
    render(CheckInControl, { ...base, initialCheckedInAt: '2026-07-25T10:00:00.000Z' });

    expect(screen.getByRole('status').classList.contains('arrived')).toBe(false);
  });

  it("lets the Member's own check-in settle into place", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              checkedInAt: '2026-07-25T10:00:00.000Z',
              alreadyCheckedIn: false,
              recognition: {
                action: 'check_in',
                recognized: false,
                activatedCurrentWeek: false,
                currentWeek: { startsOn: '2026-07-06', endsOn: '2026-07-12', active: true }
              }
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
      )
    );
    render(CheckInControl, base);

    await fireEvent.click(
      screen.getByRole('button', {
        name: catalogues.en['checkIn.actionAccessible'].replace('{name}', placeName)
      })
    );

    await waitFor(() => {
      const result = screen.getByRole('status');
      expect(result.classList.contains('arrived')).toBe(true);
      // Movement only. Svelte scopes keyframe names, so match the stem rather than the
      // emitted identifier.
      const running = getComputedStyle(result).animationName;
      expect(running).toContain('committed-rise');
      // No opacity fade: it would start the confirmation below 4.5:1 contrast and climb, which
      // Axe fails outright. Words arrive readable and move; only decoration fades.
      expect(Number.parseFloat(getComputedStyle(result).opacity)).toBe(1);
      expect(running).not.toContain('fade');
    });
  });
});
