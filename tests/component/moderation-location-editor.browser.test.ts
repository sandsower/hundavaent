import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../src/app.css';
import { catalogues } from '$i18n';
import { createDomTestMapAdapter } from '$lib/map/dom-test-adapter';
import ModerationLocationEditor from '$lib/moderation/ModerationLocationEditor.svelte';

const initialValue = {
  addressLine: 'Old address 1',
  locality: 'Reykjavík',
  postalCode: '101',
  municipality: 'reykjavik',
  latitude: 64.1466,
  longitude: -21.9426,
  geometryPrecision: 'municipality_anchor_pending_geocode',
  geometrySource: 'Imported location'
};

afterEach(() => vi.unstubAllGlobals());

describe('ModerationLocationEditor', () => {
  it('finds an Icelandic address and fills the complete saved location', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              {
                id: 'gisco-1',
                label: 'Laugavegur 30, 101 Reykjavík',
                addressLine: 'Laugavegur 30',
                locality: 'Reykjavík',
                postalCode: '101',
                municipality: 'reykjavik',
                latitude: 64.145245,
                longitude: -21.927444,
                source: 'EU GISCO Address API'
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );
    const adapter = createDomTestMapAdapter();
    const { container } = render(ModerationLocationEditor, {
      copy: catalogues.en,
      value: { ...initialValue },
      adapter,
      markerName: 'Candidate Place'
    });

    await fireEvent.input(screen.getByLabelText('Find an address or place'), {
      target: { value: 'Laugavegur 30' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Laugavegur 30, 101 Reykjavík' })
    );

    expect(hiddenValues(container)).toMatchObject({
      addressLine: 'Laugavegur 30',
      locality: 'Reykjavík',
      postalCode: '101',
      municipality: 'reykjavik',
      latitude: '64.145245',
      longitude: '-21.927444',
      geometryPrecision: 'official_address_point',
      geometrySource: 'EU GISCO Address API'
    });
  });

  it('moves the pin directly and keeps raw fields behind an optional disclosure', async () => {
    const adapter = createDomTestMapAdapter();
    const { container } = render(ModerationLocationEditor, {
      copy: catalogues.en,
      value: { ...initialValue },
      adapter,
      markerName: 'Candidate Place'
    });

    const details = screen.getByText('Edit location details', {
      selector: 'summary'
    }).parentElement;
    if (!(details instanceof HTMLDetailsElement))
      throw new Error('Missing location details disclosure');
    expect(details.open).toBe(false);
    await screen.findByRole('button', { name: 'Candidate Place' });
    adapter.simulateMarkerMove('moderation-location', {
      latitude: 64.151234,
      longitude: -21.931234
    });

    await waitFor(() =>
      expect(hiddenValues(container)).toMatchObject({
        latitude: '64.151234',
        longitude: '-21.931234',
        geometryPrecision: 'moderator_confirmed_point'
      })
    );

    await fireEvent.click(screen.getByText('Edit location details', { selector: 'summary' }));
    expect(details.open).toBe(true);
    expect(within(details).getByLabelText('Latitude')).toBeTruthy();
    expect(within(details).getByLabelText('Longitude')).toBeTruthy();
  });
});

function hiddenValues(container: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    [...container.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]')].map((input) => [
      input.name,
      input.value
    ])
  );
}
