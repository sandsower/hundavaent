import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues, type Locale } from '$i18n';
import WeeklyRoundupPage from '../../src/routes/[lang=lang]/account/roundup/+page.svelte';

const preferences = {
  configured: true,
  municipalities: ['kopavogur', 'reykjavik'] as const,
  categories: [],
  roundupLocale: 'is' as const,
  emailInterest: false,
  emailInterestChangedAt: '2026-07-23T12:00:00Z',
  updatedAt: '2026-07-23T12:00:00Z'
};

const recommendations = [
  {
    placeId: '94730000-0000-4000-8000-000000000001',
    name: 'Nýja kaffihúsið',
    category: 'cafe' as const,
    municipality: 'reykjavik' as const,
    reason: 'newly_published' as const,
    changedAt: '2026-07-17T12:00:00Z',
    rank: 1
  },
  {
    placeId: '94730000-0000-4000-8000-000000000002',
    name: 'Uppfærði garðurinn',
    category: 'park' as const,
    municipality: 'kopavogur' as const,
    reason: 'updated' as const,
    changedAt: '2026-07-18T12:00:00Z',
    rank: 2
  },
  {
    placeId: '94730000-0000-4000-8000-000000000003',
    name: 'Þriðji staðurinn',
    category: 'service' as const,
    municipality: 'reykjavik' as const,
    reason: 'updated' as const,
    changedAt: '2026-07-18T10:00:00Z',
    rank: 3
  }
];

describe('Weekly recap', () => {
  it('renders the populated content in the saved roundup language with a clear discovery route', () => {
    const { container } = renderRoundup({
      lang: 'en',
      roundup: {
        status: 'populated',
        preferences: { ...preferences, municipalities: [...preferences.municipalities] },
        week: { startsOn: '2026-07-13', endsOn: '2026-07-19' },
        recommendations
      }
    });

    expect(screen.getByRole('heading', { name: 'Weekly recap' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nokkur ný spor' })).toBeTruthy();
    expect(screen.getByText('Nýtt í vikunni')).toBeTruthy();
    expect(screen.getAllByText('Uppfært í vikunni')).toHaveLength(2);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    const placeLink = screen.getByRole('link', { name: 'Skoða Nýja kaffihúsið' });
    expect(placeLink.getAttribute('href')).toContain('/is?place=94730000');
    expect(screen.getByRole('link', { name: 'Skoða alla staði' }).getAttribute('href')).toBe('/is');
    expect(container.querySelectorAll('.roundup-icon')).not.toHaveLength(0);
  });

  it('uses an honest sparse state without progress or failure language', () => {
    renderRoundup({
      lang: 'en',
      roundup: {
        status: 'sparse',
        preferences: { ...preferences, roundupLocale: 'en' },
        week: { startsOn: '2026-07-13', endsOn: '2026-07-19' },
        recommendations: recommendations.slice(0, 2)
      }
    });

    expect(screen.getByRole('heading', { name: 'A short trail this week' })).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/streak|failed|missed|complete your/i);
  });

  it('renders configured empty and unavailable states as quiet private outcomes', () => {
    const empty = renderRoundup({
      lang: 'en',
      roundup: {
        status: 'empty',
        preferences: { ...preferences, roundupLocale: 'en' },
        week: { startsOn: '2026-07-13', endsOn: '2026-07-19' },
        recommendations: []
      }
    });
    expect(screen.getByRole('heading', { name: 'No new tracks this week' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse all places' })).toBeTruthy();

    empty.unmount();
    renderRoundup({ lang: 'is', roundup: { status: 'unavailable' } });
    expect(screen.getByRole('heading', { name: 'Vikuyfirlitið hvílir sig' })).toBeTruthy();
    expect(
      screen.getByText(
        'Ekki tókst að hlaða þessu einkayfirliti núna. Stillingarnar þínar eru enn öruggar.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Skoða alla staði' })).toBeNull();
  });

  it('shows every explicit preference and says that saving sends no email', () => {
    renderRoundup({
      lang: 'en',
      roundup: {
        status: 'unconfigured',
        preferences: {
          configured: false,
          municipalities: [],
          categories: [],
          roundupLocale: 'is',
          emailInterest: false,
          emailInterestChangedAt: null,
          updatedAt: null
        },
        week: { startsOn: '2026-07-13', endsOn: '2026-07-19' },
        recommendations: []
      }
    });

    expect(screen.getByRole('heading', { name: 'Choose where your trail begins' })).toBeTruthy();
    expect(
      screen.getAllByRole('checkbox', {
        name: /Reykjavík|Kópavogur|Seltjarnarnes|Garðabær|Hafnarfjörður|Mosfellsbær|Kjósarhreppur/
      })
    ).toHaveLength(7);
    expect(screen.getByRole('radio', { name: 'Icelandic' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', {
        name: 'I would be interested in receiving this recap by email later'
      })
    ).not.toBeChecked();
    expect(
      screen.getByText(
        'Weekly email is not active. Saving this preference sends nothing, and you can withdraw it at any time.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse all places' }).getAttribute('href')).toBe(
      '/en'
    );
    expect(screen.getByRole('button', { name: 'Save recap settings' })).toBeTruthy();
  });

  it('opens populated settings with current email interest visible and withdrawable', async () => {
    renderRoundup({
      lang: 'en',
      roundup: {
        status: 'populated',
        preferences: {
          ...preferences,
          municipalities: [...preferences.municipalities],
          roundupLocale: 'en',
          emailInterest: true
        },
        week: { startsOn: '2026-07-13', endsOn: '2026-07-19' },
        recommendations
      }
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Edit recap settings' }));

    expect(screen.getByRole('checkbox', { name: 'Reykjavík' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Kópavogur' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', {
        name: 'I would be interested in receiving this recap by email later'
      })
    ).toBeChecked();
    expect(screen.getByRole('button', { name: 'Close settings' })).toBeTruthy();
  });
});

function renderRoundup({ lang, roundup }: { lang: Locale; roundup: unknown }) {
  return render(WeeklyRoundupPage, {
    params: { lang },
    data: { lang, copy: catalogues[lang], roundup },
    form: null
  } as never);
}
