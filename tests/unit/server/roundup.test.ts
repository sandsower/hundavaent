import { describe, expect, it, vi } from 'vitest';

import {
  getWeeklyRoundup,
  saveRoundupPreferences,
  type RoundupRpcClient
} from '$server/roundup/roundup';

const preferences = {
  configured: true,
  municipalities: ['kopavogur', 'reykjavik'],
  categories: [],
  roundup_locale: 'en',
  email_interest: false,
  email_interest_changed_at: '2026-07-23T12:00:00Z',
  updated_at: '2026-07-23T12:00:00Z'
};

const baseRoundup = {
  configured: true,
  week_starts_on: '2026-07-13',
  week_ends_on: '2026-07-19',
  roundup_locale: 'en'
};

const recommendations = [
  {
    ...baseRoundup,
    place_id: '94730000-0000-4000-8000-000000000001',
    place_name: 'New Cafe',
    category: 'cafe',
    municipality: 'reykjavik',
    recommendation_reason: 'newly_published',
    changed_at: '2026-07-17T12:00:00Z',
    recommendation_rank: 1
  },
  {
    ...baseRoundup,
    place_id: '94730000-0000-4000-8000-000000000002',
    place_name: 'Updated Park',
    category: 'park',
    municipality: 'kopavogur',
    recommendation_reason: 'updated',
    changed_at: '2026-07-18T12:00:00Z',
    recommendation_rank: 2
  }
];

describe('Weekly roundup server boundary', () => {
  it('maps three or more deterministic recommendations to a populated private roundup', async () => {
    const { client, rpc } = clientWith({
      preferences: [preferences],
      roundup: [
        ...recommendations,
        {
          ...recommendations[1],
          place_id: '94730000-0000-4000-8000-000000000003',
          place_name: 'Third Place',
          recommendation_rank: 3
        }
      ]
    });

    await expect(getWeeklyRoundup(client)).resolves.toMatchObject({
      status: 'success',
      value: {
        status: 'populated',
        week: { startsOn: '2026-07-13', endsOn: '2026-07-19' },
        preferences: {
          configured: true,
          municipalities: ['kopavogur', 'reykjavik'],
          categories: [],
          roundupLocale: 'en',
          emailInterest: false
        },
        recommendations: [
          { name: 'New Cafe', reason: 'newly_published', rank: 1 },
          { name: 'Updated Park', reason: 'updated', rank: 2 },
          { name: 'Third Place', rank: 3 }
        ]
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_current_member_roundup_preferences');
    expect(rpc).toHaveBeenCalledWith('get_current_member_weekly_roundup');
  });

  it('maps one or two recommendations to the honest sparse state', async () => {
    const { client } = clientWith({ preferences: [preferences], roundup: recommendations });

    await expect(getWeeklyRoundup(client)).resolves.toMatchObject({
      status: 'success',
      value: {
        status: 'sparse',
        recommendations: [{ rank: 1 }, { rank: 2 }]
      }
    });
  });

  it('distinguishes configured empty and unconfigured sentinels', async () => {
    const configuredEmpty = clientWith({
      preferences: [preferences],
      roundup: [
        {
          ...baseRoundup,
          place_id: null,
          place_name: null,
          category: null,
          municipality: null,
          recommendation_reason: null,
          changed_at: null,
          recommendation_rank: null
        }
      ]
    }).client;
    const unconfigured = clientWith({
      preferences: [
        {
          configured: false,
          municipalities: [],
          categories: [],
          roundup_locale: 'is',
          email_interest: false,
          email_interest_changed_at: null,
          updated_at: null
        }
      ],
      roundup: [
        {
          ...baseRoundup,
          configured: false,
          roundup_locale: 'is',
          place_id: null,
          place_name: null,
          category: null,
          municipality: null,
          recommendation_reason: null,
          changed_at: null,
          recommendation_rank: null
        }
      ]
    }).client;

    await expect(getWeeklyRoundup(configuredEmpty)).resolves.toMatchObject({
      status: 'success',
      value: { status: 'empty', recommendations: [] }
    });
    await expect(getWeeklyRoundup(unconfigured)).resolves.toMatchObject({
      status: 'success',
      value: {
        status: 'unconfigured',
        preferences: { configured: false, roundupLocale: 'is' },
        recommendations: []
      }
    });
  });

  it('fails closed for inconsistent, malformed, overlong, or unavailable private RPC data', async () => {
    const malformedValues = [
      {
        preferences: [preferences],
        roundup: [{ ...recommendations[0], recommendation_rank: 2 }]
      },
      {
        preferences: [preferences],
        roundup: [{ ...recommendations[0], roundup_locale: 'is' }]
      },
      {
        preferences: [preferences],
        roundup: Array.from({ length: 7 }, (_, index) => ({
          ...recommendations[0],
          place_id: `94730000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          recommendation_rank: index + 1
        }))
      },
      {
        preferences: [{ ...preferences, municipalities: ['private-coordinate'] }],
        roundup: recommendations
      }
    ];

    for (const value of malformedValues) {
      await expect(getWeeklyRoundup(clientWith(value).client)).resolves.toEqual({
        status: 'unavailable'
      });
    }

    await expect(
      getWeeklyRoundup(
        clientWith({ preferences: null, roundup: null }, { code: 'private_failure' }).client
      )
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('saves the canonical explicit preference tuple and maps the authoritative response', async () => {
    const rpc = vi.fn(async (name: string, args?: unknown) => {
      if (name === 'save_current_member_roundup_preferences') {
        return { data: [preferences], error: null };
      }
      throw new Error(`Unexpected RPC ${name} ${JSON.stringify(args)}`);
    });
    const client = { rpc } as unknown as RoundupRpcClient;

    await expect(
      saveRoundupPreferences(client, {
        municipalities: ['kopavogur', 'reykjavik'],
        categories: [],
        roundupLocale: 'en',
        emailInterest: false
      })
    ).resolves.toMatchObject({
      status: 'success',
      value: {
        configured: true,
        municipalities: ['kopavogur', 'reykjavik'],
        categories: [],
        roundupLocale: 'en',
        emailInterest: false
      }
    });
    expect(rpc).toHaveBeenCalledWith('save_current_member_roundup_preferences', {
      requested_municipalities: ['kopavogur', 'reykjavik'],
      requested_categories: [],
      requested_locale: 'en',
      requested_email_interest: false
    });
  });
});

function clientWith(values: { preferences: unknown; roundup: unknown }, error: unknown = null) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_current_member_roundup_preferences') {
      return { data: values.preferences, error };
    }
    if (name === 'get_current_member_weekly_roundup') {
      return { data: values.roundup, error };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  return { client: { rpc } as unknown as RoundupRpcClient, rpc };
}
