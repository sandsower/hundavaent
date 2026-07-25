import { describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import { actions, load } from '../../../src/routes/[lang=lang]/suggest/+page.server';

const commandId = 'b1000000-0000-4000-8000-000000000001';

/**
 * Approved decision 6: the three questions are readable by anyone, and only sending is gated. A
 * load-time redirect would have made the map's permanent entry point permanently reachable for
 * Members alone, so the gate lives in the action - and nothing may reach the Suggestion RPC before
 * it passes.
 */
describe('Suggestion page boundary', () => {
  it('renders the questions for a signed-out visitor instead of redirecting them away', async () => {
    const data = await load(eventWith(signedOutClient()) as never);

    expect(data).toMatchObject({
      signInUrl: '/en/account?returnTo=%2Fen%2Fsuggest%3Flatitude%3D64.15%26longitude%3D-21.93',
      presetLatitude: '64.15',
      presetLongitude: '-21.93'
    });
    expect(data).not.toHaveProperty('unavailable');
    expect(typeof (data as { commandId?: string }).commandId).toBe('string');
  });

  it('carries the same sign-in return path for a signed-in Member', async () => {
    const data = await load(eventWith(memberClient()) as never);

    expect(data).toMatchObject({
      signInUrl: '/en/account?returnTo=%2Fen%2Fsuggest%3Flatitude%3D64.15%26longitude%3D-21.93'
    });
  });

  it('refuses a signed-out submission without sending anything', async () => {
    const client = signedOutClient();

    await expect(
      actions.default?.({ ...eventWith(client), request: minimalRequest() } as never)
    ).resolves.toMatchObject({
      status: 401,
      data: { error: 'authentication_required' }
    });
    expect(client.rpc).not.toHaveBeenCalledWith('submit_place_suggestion', expect.anything());
  });

  it('sends the whole minimal profile once the Member is signed in', async () => {
    const client = memberClient();

    await expect(
      actions.default?.({ ...eventWith(client), request: minimalRequest() } as never)
    ).rejects.toMatchObject({ status: 303 });

    const call = client.rpc.mock.calls.find(([name]) => name === 'submit_place_suggestion');
    expect(call).toBeDefined();
    const { command_proposal: proposal } = (
      call as unknown as [string, { command_proposal: Record<string, unknown> }]
    )[1];
    expect(proposal).toMatchObject({
      category: 'other',
      operator_name: 'Minimal route cafe'
    });
  });
});

function minimalRequest(): Request {
  return new Request('https://hundavaent.test/en/suggest', {
    method: 'POST',
    body: new URLSearchParams({
      commandId,
      purpose: 'dog_access_destination',
      submissionProfile: 'minimal-v1',
      name: 'Minimal route cafe',
      latitude: '64.15',
      longitude: '-21.93',
      accessArea: 'indoors'
    })
  });
}

function memberClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'member-1' } }, error: null }))
    },
    rpc: vi.fn(async (name: string) => {
      if (name === 'has_current_user_role') return { data: true, error: null };
      if (name === 'submit_place_suggestion') {
        return {
          data: [
            {
              suggestion_id: '85000000-0000-4000-8000-000000000009',
              status: 'submitted',
              submitted_at: '2026-07-25T10:30:00Z',
              qualifying_action_recorded: true,
              activated_current_week: false,
              current_week_starts_on: '2026-07-20',
              current_week_ends_on: '2026-07-26',
              current_week_active: true
            }
          ],
          error: null
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    })
  };
}

function signedOutClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null }))
    },
    rpc: vi.fn(async () => ({ data: null, error: null }))
  };
}

function eventWith(client: { auth: unknown; rpc: unknown }) {
  return {
    locals: {
      requestId: 'request-suggestion',
      copy: catalogues.en,
      supabase: client
    },
    params: { lang: 'en' },
    url: new URL('https://hundavaent.test/en/suggest?latitude=64.15&longitude=-21.93')
  };
}
