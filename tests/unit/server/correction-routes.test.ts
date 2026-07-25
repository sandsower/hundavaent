import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublishedPlaceProfile } from '../../../src/lib/server/discovery/public-places';

const { getPublishedProfile } = vi.hoisted(() => ({ getPublishedProfile: vi.fn() }));
vi.mock('$server/discovery/public-places', () => ({ getPublishedProfile }));

const { POST } = await import('../../../src/routes/api/places/[id]/corrections/+server');

const placeId = '30000000-0000-4000-8000-000000000003';
const accessConditionId = '40000000-0000-4000-8000-000000000003';
const commandId = 'a2000000-0000-4000-8000-000000000001';

function profile(overrides: Record<string, unknown> = {}): PublishedPlaceProfile {
  return {
    placeId,
    name: 'Brikk',
    description: 'A cafe.',
    category: 'cafe',
    location: {
      addressLine: 'Gata 1',
      locality: 'Reykjavík',
      postalCode: '101',
      latitude: 64.15,
      longitude: -21.95
    },
    websiteUrl: null,
    phone: null,
    wheelchairAccessibility: 'unknown',
    openingHours: {},
    dogAmenities: [],
    accessConditions: [
      {
        id: accessConditionId,
        accessArea: 'indoors',
        accessAreaNote: null,
        restraintCondition: 'leash_required',
        restraintNote: 'Short leashes only.',
        dogEligibility: { scope: 'restricted', maximumWeightKg: 10 },
        availabilityWindow: {},
        availabilityState: 'not_stated',
        permissionRequirement: 'standing_permission'
      }
    ],
    dogFriendlinessSummary: {
      placeId,
      visible: false,
      overallVisible: false,
      overallMean: null,
      eligibleCount: null,
      dimensions: null
    },
    photos: [],
    ...overrides
  } as unknown as PublishedPlaceProfile;
}

function submissionRow() {
  return [
    {
      flag_id: 'flag-1',
      status: 'submitted',
      submitted_at: '2026-07-25T09:00:00Z',
      qualifying_action_recorded: true,
      activated_current_week: false,
      current_week_starts_on: '2026-07-20',
      current_week_ends_on: '2026-07-26',
      current_week_active: true
    },
    null
  ] as const;
}

function memberClient() {
  return {
    auth: {
      getUser: vi.fn(async (): Promise<{ data: { user: { id: string } | null }; error: null }> => ({
        data: { user: { id: 'member' } },
        error: null
      }))
    },
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      void args;
      if (name === 'get_current_member_account')
        return { data: [{ member_id: 'member' }], error: null };
      if (name === 'submit_place_correction') {
        const [row] = submissionRow();
        return { data: [row], error: null };
      }
      return { data: null, error: { code: 'unexpected' } };
    })
  };
}

function submittedCommand(client: ReturnType<typeof memberClient>): Record<string, unknown> {
  const call = client.rpc.mock.calls.find(([name]) => name === 'submit_place_correction');
  if (!call) throw new Error('The Correction RPC was never called');
  return (call[1] as { command_payload: Record<string, unknown> }).command_payload;
}

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/places/place/corrections', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': commandId, ...headers },
    body: JSON.stringify(body)
  });
}

function event(client: ReturnType<typeof memberClient>, body: unknown, lang = 'is') {
  return {
    cookies: {},
    locals: { supabase: client, requestId: crypto.randomUUID() },
    params: { id: placeId },
    request: request(body),
    url: new URL(`http://localhost/api/places/${placeId}/corrections?lang=${lang}`)
  } as never;
}

beforeEach(() => {
  getPublishedProfile.mockResolvedValue({ status: 'success', value: profile() });
});

describe('inline Access Condition Correction API', () => {
  it('carries the real dog eligibility through and never hardcodes all_dogs', async () => {
    const client = memberClient();
    const response = await POST(
      event(client, { accessConditionId, restraintCondition: 'off_leash_permitted' })
    );

    expect(response.status).toBe(200);
    const command = submittedCommand(client);
    expect(command.proposed_value).toEqual({
      access_area: 'indoors',
      access_area_note: null,
      restraint_condition: 'off_leash_permitted',
      restraint_note: null,
      dog_eligibility: { scope: 'restricted', maximumWeightKg: 10 },
      availability_state: 'not_stated',
      availability_window: {},
      permission_requirement: 'standing_permission'
    });
  });

  it('synthesizes member_report evidence and a factual explanation when no note is given', async () => {
    const client = memberClient();
    await POST(event(client, { accessConditionId, restraintCondition: 'off_leash_permitted' }));

    const command = submittedCommand(client);
    expect(command.evidence).toMatchObject({
      kind: 'member_report',
      source_label: 'Member report from the place page',
      source_url: null,
      source_metadata: {
        submissionProfile: 'inline-v1',
        surface: 'place-card',
        citationSource: 'synthesized'
      }
    });
    expect(command.explanation).toBe(
      'Restraint condition changed from leash required to off-leash allowed, reported from the place card.'
    );
  });

  it("uses the member's note as both explanation and citation when they wrote one", async () => {
    const client = memberClient();
    await POST(
      event(client, {
        accessConditionId,
        restraintCondition: 'carrier_required',
        note: 'They now ask for a carrier.'
      })
    );

    const command = submittedCommand(client);
    expect(command.explanation).toBe('They now ask for a carrier.');
    expect(command.evidence).toMatchObject({
      source_citation: 'They now ask for a carrier.',
      source_metadata: { citationSource: 'member' }
    });
  });

  it('reports an unchanged restraint without creating a no-op flag', async () => {
    const client = memberClient();
    const response = await POST(
      event(client, { accessConditionId, restraintCondition: 'leash_required' })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'unchanged' });
    expect(client.rpc.mock.calls.map(([name]) => name)).not.toContain('submit_place_correction');
  });

  it('does not carry a restraint note describing the rule that just changed', async () => {
    const client = memberClient();
    await POST(event(client, { accessConditionId, restraintCondition: 'carrier_required' }));

    const command = submittedCommand(client);
    expect((command.proposed_value as Record<string, unknown>).restraint_note).toBeNull();
  });

  it('rejects an Access Condition that does not belong to this Place', async () => {
    const client = memberClient();
    const response = await POST(
      event(client, {
        accessConditionId: '40000000-0000-4000-8000-000000000009',
        restraintCondition: 'off_leash_permitted'
      })
    );

    expect(response.status).toBe(404);
    expect(client.rpc.mock.calls.map(([name]) => name)).not.toContain('submit_place_correction');
  });

  it('requires a member before it reads the profile at all', async () => {
    const client = memberClient();
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST(
      event(client, { accessConditionId, restraintCondition: 'off_leash_permitted' })
    );

    expect(response.status).toBe(401);
    expect(getPublishedProfile).not.toHaveBeenCalled();
  });

  it('rejects a malformed body without reaching the profile', async () => {
    const client = memberClient();
    const response = await POST(
      event(client, { accessConditionId, restraintCondition: 'other_sourced' })
    );

    expect(response.status).toBe(400);
    expect(getPublishedProfile).not.toHaveBeenCalled();
  });

  it('rejects a malformed idempotency key', async () => {
    const client = memberClient();
    const response = await POST({
      cookies: {},
      locals: { supabase: client, requestId: crypto.randomUUID() },
      params: { id: placeId },
      request: request(
        { accessConditionId, restraintCondition: 'off_leash_permitted' },
        { 'idempotency-key': 'not-a-uuid' }
      ),
      url: new URL(`http://localhost/api/places/${placeId}/corrections?lang=is`)
    } as never);

    expect(response.status).toBe(400);
  });

  it('rejects a missing or unknown language', async () => {
    const client = memberClient();
    const response = await POST(
      event(client, { accessConditionId, restraintCondition: 'off_leash_permitted' }, 'fr')
    );

    expect(response.status).toBe(400);
  });

  it('maps a rate limit to 429 rather than a generic failure', async () => {
    const client = memberClient();
    client.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_current_member_account')
        return { data: [{ member_id: 'member' }], error: null };
      if (name === 'submit_place_correction') return { data: null, error: { code: '54000' } };
      return { data: null, error: { code: 'unexpected' } };
    });

    const response = await POST(
      event(client, { accessConditionId, restraintCondition: 'off_leash_permitted' })
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'rate_limited' });
  });

  it('maps a command conflict to 409', async () => {
    const client = memberClient();
    client.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_current_member_account')
        return { data: [{ member_id: 'member' }], error: null };
      if (name === 'submit_place_correction') return { data: null, error: { code: '55006' } };
      return { data: null, error: { code: 'unexpected' } };
    });

    const response = await POST(
      event(client, { accessConditionId, restraintCondition: 'off_leash_permitted' })
    );

    expect(response.status).toBe(409);
  });

  it('keeps the response private and returns the recognition the member earned', async () => {
    const client = memberClient();
    const response = await POST(
      event(client, { accessConditionId, restraintCondition: 'off_leash_permitted' })
    );

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.status).toBe('submitted');
    expect(payload.flagId).toBe('flag-1');
    expect(payload.recognition).toMatchObject({ action: 'correction' });
  });

  it('reports an unavailable profile as unavailable rather than as a bad request', async () => {
    getPublishedProfile.mockResolvedValue({ status: 'infrastructure_error' });
    const client = memberClient();

    const response = await POST(
      event(client, { accessConditionId, restraintCondition: 'off_leash_permitted' })
    );

    expect(response.status).toBe(503);
  });
});
