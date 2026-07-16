import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import SharePlaceControl from '$lib/discovery/SharePlaceControl.svelte';

const placeId = '30000000-0000-4000-8000-000000000003';

afterEach(() => vi.unstubAllGlobals());

describe('SharePlaceControl', () => {
  it('copies only the canonical Place URL and announces success', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(SharePlaceControl, {
      placeId,
      placeName: 'Published Place',
      lang: 'en',
      copy: catalogues.en
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Share Published Place' }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/en?place=${placeId}`);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Link copied'));
  });

  it('uses localized labels', () => {
    render(SharePlaceControl, {
      placeId,
      placeName: 'Staður',
      lang: 'is',
      copy: catalogues.is
    });

    expect(screen.getByRole('button', { name: 'Deila Staður' })).toBeTruthy();
  });
});
