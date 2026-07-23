import { describe, expect, it, vi } from 'vitest';

import { actions, load } from '../../../src/routes/[lang=lang]/account/roundup/+page.server';

const preferenceRow = {
  configured: true,
  municipalities: ['reykjavik'],
  categories: ['cafe'],
  roundup_locale: 'en',
  email_interest: false,
  email_interest_changed_at: '2026-07-23T12:00:00Z',
  updated_at: '2026-07-23T12:00:00Z'
};

const roundupRow = {
  configured: true,
  week_starts_on: '2026-07-13',
  week_ends_on: '2026-07-19',
  roundup_locale: 'en',
  place_id: null,
  place_name: null,
  category: null,
  municipality: null,
  recommendation_reason: null,
  changed_at: null,
  recommendation_rank: null
};

describe('Weekly roundup page boundary', () => {
  it('keeps GET pure and never activates the weekly rhythm', async () => {
    const rpc = roundupRpc();

    await expect(load(eventWith({ rpc }) as never)).resolves.toMatchObject({
      roundup: {
        status: 'empty',
        preferences: {
          configured: true,
          municipalities: ['reykjavik'],
          categories: ['cafe'],
          roundupLocale: 'en',
          emailInterest: false
        }
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_current_member_roundup_preferences');
    expect(rpc).toHaveBeenCalledWith('get_current_member_weekly_roundup');
    expect(rpc).not.toHaveBeenCalledWith('get_current_member_weekly_rhythm');
    expect(rpc).not.toHaveBeenCalledWith(
      expect.stringMatching(/record|set_current|claim|complete/)
    );
  });

  it('returns the private unavailable state instead of exposing an RPC failure', async () => {
    const rpc = roundupRpc({ roundupError: { code: 'private_failure' } });

    await expect(load(eventWith({ rpc }) as never)).resolves.toEqual({
      roundup: { status: 'unavailable' }
    });
  });

  it('saves explicit preferences through the authenticated named action', async () => {
    const rpc = roundupRpc();
    const action = actions.savePreferences;

    await expect(
      action?.(
        eventWith({
          rpc,
          request: formRequest({
            municipalities: ['reykjavik', 'kopavogur'],
            categories: ['restaurant', 'cafe', 'accommodation'],
            roundupLocale: 'is',
            emailInterest: 'true'
          })
        }) as never
      )
    ).resolves.toMatchObject({
      action: 'savePreferences',
      success: true
    });
    expect(rpc).toHaveBeenCalledWith('save_current_member_roundup_preferences', {
      requested_municipalities: ['kopavogur', 'reykjavik'],
      requested_categories: ['accommodation', 'cafe', 'restaurant'],
      requested_locale: 'is',
      requested_email_interest: true
    });
  });

  it('rejects synthetic location fields before invoking the save RPC', async () => {
    const rpc = roundupRpc();
    const request = formRequest({
      municipalities: ['reykjavik'],
      categories: [],
      roundupLocale: 'is'
    });
    const body = await request.formData();
    body.set('latitude', '64.1');
    const action = actions.savePreferences;

    const result = await action?.(
      eventWith({
        rpc,
        request: new Request('https://hundavaent.test/is/account/roundup', {
          method: 'POST',
          body
        })
      }) as never
    );

    expect(result).toMatchObject({
      status: 400,
      data: { action: 'savePreferences', error: 'invalid' }
    });
    expect(rpc).not.toHaveBeenCalledWith(
      'save_current_member_roundup_preferences',
      expect.anything()
    );
  });
});

function roundupRpc({ roundupError = null }: { roundupError?: unknown } = {}) {
  return vi.fn(async (name: string) => {
    if (name === 'has_current_user_role') return { data: true, error: null };
    if (name === 'get_current_member_roundup_preferences') {
      return { data: [preferenceRow], error: null };
    }
    if (name === 'get_current_member_weekly_roundup') {
      return { data: [roundupRow], error: roundupError };
    }
    if (name === 'save_current_member_roundup_preferences') {
      return {
        data: [
          {
            ...preferenceRow,
            municipalities: ['kopavogur', 'reykjavik'],
            categories: ['park'],
            roundup_locale: 'is',
            email_interest: true
          }
        ],
        error: null
      };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
}

function eventWith({
  rpc,
  request = formRequest({
    municipalities: ['reykjavik'],
    categories: [],
    roundupLocale: 'is'
  })
}: {
  rpc: ReturnType<typeof vi.fn>;
  request?: Request;
}) {
  return {
    locals: {
      requestId: 'request-roundup',
      supabase: {
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: 'member-1' } },
            error: null
          }))
        },
        rpc
      }
    },
    params: { lang: 'en' },
    url: new URL('https://hundavaent.test/en/account/roundup'),
    request
  };
}

function formRequest(values: {
  municipalities: string[];
  categories: string[];
  roundupLocale: string;
  emailInterest?: string;
}) {
  const form = new FormData();
  for (const municipality of values.municipalities) {
    form.append('municipalities', municipality);
  }
  for (const category of values.categories) form.append('categories', category);
  form.set('roundupLocale', values.roundupLocale);
  if (values.emailInterest) form.set('emailInterest', values.emailInterest);
  return new Request('https://hundavaent.test/en/account/roundup', {
    method: 'POST',
    body: form
  });
}
