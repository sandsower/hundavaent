import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import { defaultDiscoveryState } from '$lib/discovery/state';
import PublicDirectoryPage from '../../src/routes/[lang=lang]/+page.svelte';

describe('public directory tracer', () => {
  it('renders localized route data through a real browser component', () => {
    render(PublicDirectoryPage, {
      params: {
        lang: 'is'
      },
      data: {
        lang: 'is',
        copy: catalogues.is,
        places: [],
        discoveryState: defaultDiscoveryState,
        fitPlacesOnMount: false,
        mapStyleUrl: null,
        forceMapFailure: false,
        proximityAssistEnabled: false,
        favouritesAvailable: true
      },
      form: null
    });

    expect(screen.getByRole('button', { name: 'Sýna 0 niðurstöður' })).toBeTruthy();
    expect(screen.getByText('Engir staðir passa')).toBeTruthy();
    expect(screen.queryByText('Finndu hundvæna staði á höfuðborgarsvæðinu.')).toBeNull();
  });
});
