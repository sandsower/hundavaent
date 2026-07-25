import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPublishedProfile, getStoredAccessCondition } = vi.hoisted(() => ({
  getPublishedProfile: vi.fn(),
  getStoredAccessCondition: vi.fn()
}));
vi.mock('$server/discovery/public-places', () => ({
  getPublishedProfile,
  getStoredAccessCondition
}));

const { GET, POST } = await import('../../../src/routes/api/places/[id]/corrections/+server');

const placeId = '30000000-0000-4000-8000-000000000003';
const accessConditionId = '40000000-0000-4000-8000-000000000003';
const commandId = 'a2000000-0000-4000-8000-000000000001';

function correction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    target: 'access_condition',
    accessConditionId,
    dimension: 'restraint',
    value: 'off_leash_permitted',
    ...overrides
  };
}

function storedCondition(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: accessConditionId,
    accessArea: 'indoors',
    accessAreaNote: null,
    restraintCondition: 'leash_required',
    restraintNote: 'Short leashes only.',
    dogEligibility: { scope: 'restricted', maximumWeightKg: 10 },
    availabilityWindow: {},
    availabilityState: 'not_stated',
    permissionRequirement: 'standing_permission',
    ...overrides
  };
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

function openFlagRows() {
  return [
    {
      kind: 'correction',
      target_kind: 'place_field',
      target_field: 'name',
      access_condition_id: null,
      report_reason: null,
      status: 'submitted'
    },
    {
      kind: 'report',
      target_kind: 'access_condition',
      target_field: null,
      access_condition_id: accessConditionId,
      report_reason: 'closed',
      status: 'needs_information'
    }
  ];
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
      if (name === 'list_my_open_place_flags') return { data: openFlagRows(), error: null };
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

function publishedProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    placeId,
    name: 'Kaffi Taumur',
    websiteUrl: 'https://example.invalid/taumur',
    phone: '+354 555 1234',
    dogAmenities: ['water bowl'],
    accessConditions: [],
    ...overrides
  };
}

function placeFieldCorrection(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { target: 'place_field', field: 'name', value: 'Kaffi Taumurinn', ...overrides };
}

function readEvent(client: ReturnType<typeof memberClient>) {
  return {
    cookies: {},
    locals: { supabase: client, requestId: crypto.randomUUID() },
    params: { id: placeId },
    request: new Request(`http://localhost/api/places/${placeId}/corrections`),
    url: new URL(`http://localhost/api/places/${placeId}/corrections`)
  } as never;
}

beforeEach(() => {
  getStoredAccessCondition.mockResolvedValue({ status: 'success', value: storedCondition() });
  getPublishedProfile.mockResolvedValue({ status: 'success', value: publishedProfile() });
});

describe('inline Access Condition Correction API', () => {
  it('carries the real dog eligibility through and never hardcodes all_dogs', async () => {
    const client = memberClient();
    const response = await POST(event(client, correction()));

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

  it('swaps the area alone and leaves the restraint and its note standing', async () => {
    const client = memberClient();
    const response = await POST(
      event(client, correction({ dimension: 'area', value: 'outdoors' }))
    );

    expect(response.status).toBe(200);
    const command = submittedCommand(client);
    expect(command.proposed_value).toEqual({
      access_area: 'outdoors',
      access_area_note: null,
      restraint_condition: 'leash_required',
      restraint_note: 'Short leashes only.',
      dog_eligibility: { scope: 'restricted', maximumWeightKg: 10 },
      availability_state: 'not_stated',
      availability_window: {},
      permission_requirement: 'standing_permission'
    });
    expect(command.explanation).toBe(
      'Access area changed from indoors to outdoors, reported from the place card.'
    );
  });

  it('synthesizes member_report evidence and a factual explanation when no note is given', async () => {
    const client = memberClient();
    await POST(event(client, correction()));

    const command = submittedCommand(client);
    expect(command.evidence).toMatchObject({
      kind: 'member_report',
      source_label: 'Member report from the place page',
      source_url: null,
      source_metadata: {
        submissionProfile: 'inline-v1',
        surface: 'place-card',
        memberNoteProvided: false
      }
    });
    expect(command.explanation).toBe(
      'Restraint condition changed from leash required to off-leash allowed, reported from the place card.'
    );
  });

  it("uses the member's note as the explanation but never as the citation", async () => {
    const client = memberClient();
    await POST(
      event(client, correction({ value: 'carrier_required', note: 'They now ask for a carrier.' }))
    );

    const command = submittedCommand(client);
    // The Member's own words reach the Moderator through the explanation, which no public
    // projection reads. They must not reach Evidence, whose citation can be published.
    expect(command.explanation).toBe('They now ask for a carrier.');
    expect(command.evidence).toMatchObject({
      source_citation:
        'Restraint condition changed from leash required to carrier required, reported from the place card.',
      source_metadata: { memberNoteProvided: true }
    });
    expect(JSON.stringify(command.evidence)).not.toContain('They now ask for a carrier.');
  });

  it('carries a stored note the visitor projection would have withheld', async () => {
    // getPublishedProfile scrubs notes containing a URL, and the database requires an
    // other_bounded condition to keep its note, so rebuilding from that projection would make
    // this Place permanently uncorrectable.
    getStoredAccessCondition.mockResolvedValue({
      status: 'success',
      value: storedCondition({
        accessArea: 'other_bounded',
        accessAreaNote: 'Fenced yard, map at https://example.invalid/yard'
      })
    });
    const client = memberClient();
    const response = await POST(event(client, correction()));

    expect(response.status).toBe(200);
    const proposed = submittedCommand(client).proposed_value as Record<string, unknown>;
    expect(proposed.access_area).toBe('other_bounded');
    expect(proposed.access_area_note).toBe('Fenced yard, map at https://example.invalid/yard');
  });

  it('reports an unchanged restraint without creating a no-op flag', async () => {
    const client = memberClient();
    const response = await POST(event(client, correction({ value: 'leash_required' })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'unchanged' });
    expect(client.rpc.mock.calls.map(([name]) => name)).not.toContain('submit_place_correction');
  });

  it('reports an unchanged area without creating a no-op flag', async () => {
    const client = memberClient();
    const response = await POST(event(client, correction({ dimension: 'area', value: 'indoors' })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'unchanged' });
    expect(client.rpc.mock.calls.map(([name]) => name)).not.toContain('submit_place_correction');
  });

  it('does not carry a restraint note describing the rule that just changed', async () => {
    const client = memberClient();
    await POST(event(client, correction({ value: 'carrier_required' })));

    const command = submittedCommand(client);
    expect((command.proposed_value as Record<string, unknown>).restraint_note).toBeNull();
  });

  it('does not carry an area note describing the area that just changed', async () => {
    getStoredAccessCondition.mockResolvedValue({
      status: 'success',
      value: storedCondition({ accessAreaNote: 'The covered terrace only.' })
    });
    const client = memberClient();
    await POST(event(client, correction({ dimension: 'area', value: 'designated_area' })));

    const command = submittedCommand(client);
    expect((command.proposed_value as Record<string, unknown>).access_area_note).toBeNull();
  });

  it('rejects an Access Condition that does not belong to this Place', async () => {
    getStoredAccessCondition.mockResolvedValue({ status: 'not_found' });
    const client = memberClient();
    const response = await POST(
      event(client, correction({ accessConditionId: '40000000-0000-4000-8000-000000000009' }))
    );

    expect(response.status).toBe(404);
    expect(client.rpc.mock.calls.map(([name]) => name)).not.toContain('submit_place_correction');
  });

  it('requires a member before it reads the profile at all', async () => {
    const client = memberClient();
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST(event(client, correction()));

    expect(response.status).toBe(401);
    expect(getStoredAccessCondition).not.toHaveBeenCalled();
  });

  it('rejects a malformed body without reaching the profile', async () => {
    const client = memberClient();
    const response = await POST(event(client, correction({ value: 'other_sourced' })));

    expect(response.status).toBe(400);
    expect(getStoredAccessCondition).not.toHaveBeenCalled();
  });

  it('rejects an area the member is not offered without reaching the profile', async () => {
    const client = memberClient();
    const response = await POST(
      event(client, correction({ dimension: 'area', value: 'other_bounded' }))
    );

    expect(response.status).toBe(400);
    expect(getStoredAccessCondition).not.toHaveBeenCalled();
  });

  it('rejects a malformed idempotency key', async () => {
    const client = memberClient();
    const response = await POST({
      cookies: {},
      locals: { supabase: client, requestId: crypto.randomUUID() },
      params: { id: placeId },
      request: request(correction(), { 'idempotency-key': 'not-a-uuid' }),
      url: new URL(`http://localhost/api/places/${placeId}/corrections?lang=is`)
    } as never);

    expect(response.status).toBe(400);
  });

  it('rejects a missing or unknown language', async () => {
    const client = memberClient();
    const response = await POST(event(client, correction(), 'fr'));

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

    const response = await POST(event(client, correction()));

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

    const response = await POST(event(client, correction()));

    expect(response.status).toBe(409);
  });

  it('keeps the response private and returns the recognition the member earned', async () => {
    const client = memberClient();
    const response = await POST(event(client, correction()));

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.status).toBe('submitted');
    expect(payload.flagId).toBe('flag-1');
    expect(payload.recognition).toMatchObject({ action: 'correction' });
  });

  it('reports an unavailable profile as unavailable rather than as a bad request', async () => {
    getStoredAccessCondition.mockResolvedValue({ status: 'infrastructure_error' });
    const client = memberClient();

    const response = await POST(event(client, correction()));

    expect(response.status).toBe(503);
  });
});

describe('inline Place field Correction API', () => {
  it('builds the omitted-locale hatch from the request language, never from the client', async () => {
    const client = memberClient();
    const response = await POST(event(client, placeFieldCorrection(), 'en'));

    expect(response.status).toBe(200);
    const command = submittedCommand(client);
    expect(command.target_kind).toBe('place_field');
    expect(command.target_field).toBe('name');
    expect(command.access_condition_id).toBeNull();
    expect(command.proposed_value).toEqual({ en: 'Kaffi Taumurinn', needs_review: 'is' });
  });

  it('names the other locale for review when the member is reading in icelandic', async () => {
    const client = memberClient();
    await POST(event(client, placeFieldCorrection(), 'is'));

    expect(submittedCommand(client).proposed_value).toEqual({
      is: 'Kaffi Taumurinn',
      needs_review: 'en'
    });
  });

  it('wraps a website, a phone and an amenity list in their own value shapes', async () => {
    const client = memberClient();
    await POST(
      event(
        client,
        placeFieldCorrection({ field: 'website_url', value: 'https://example.invalid/new' })
      )
    );
    expect(submittedCommand(client).proposed_value).toEqual({
      value: 'https://example.invalid/new'
    });

    const phoneClient = memberClient();
    await POST(
      event(phoneClient, placeFieldCorrection({ field: 'phone', value: '+354 555 9999' }))
    );
    expect(submittedCommand(phoneClient).proposed_value).toEqual({ value: '+354 555 9999' });

    const amenityClient = memberClient();
    await POST(
      event(
        amenityClient,
        placeFieldCorrection({ field: 'dog_amenities', value: ['water bowl', 'shade'] })
      )
    );
    expect(submittedCommand(amenityClient).proposed_value).toEqual({
      value: ['water bowl', 'shade']
    });
  });

  it('reports an unchanged name without creating a no-op flag', async () => {
    const client = memberClient();
    const response = await POST(
      event(client, placeFieldCorrection({ value: 'Kaffi Taumur' }), 'is')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'unchanged' });
    expect(client.rpc.mock.calls.map(([name]) => name)).not.toContain('submit_place_correction');
  });

  it('reports an unchanged amenity list however the member ordered it', async () => {
    getPublishedProfile.mockResolvedValue({
      status: 'success',
      value: publishedProfile({ dogAmenities: ['water bowl', 'shade'] })
    });
    const client = memberClient();
    const response = await POST(
      event(
        client,
        placeFieldCorrection({ field: 'dog_amenities', value: ['shade', 'water bowl'] })
      )
    );

    expect(await response.json()).toEqual({ status: 'unchanged' });
  });

  it('keeps the member note out of the citation and out of the summary', async () => {
    const note = 'The sign outside says Taumurinn now.';
    const client = memberClient();
    await POST(event(client, placeFieldCorrection({ note }), 'is'));

    const command = submittedCommand(client);
    expect(command.explanation).toBe(note);
    expect(command.evidence).toMatchObject({
      source_citation: 'Correction to the place name, reported from the place card.',
      source_metadata: { memberNoteProvided: true }
    });
    expect(JSON.stringify(command.evidence)).not.toContain(note);
    expect(JSON.stringify(command.evidence)).not.toContain('Kaffi Taumurinn');
  });

  it('never names the value the member typed in the change summary', async () => {
    const client = memberClient();
    await POST(event(client, placeFieldCorrection({ field: 'phone', value: '+354 555 9999' })));

    const command = submittedCommand(client);
    expect(command.explanation).toBe(
      'Correction to the phone number, reported from the place card.'
    );
    expect(JSON.stringify(command.evidence)).not.toContain('555 9999');
  });

  it('rejects a Place that is not published', async () => {
    getPublishedProfile.mockResolvedValue({ status: 'not_found' });
    const client = memberClient();
    const response = await POST(event(client, placeFieldCorrection()));

    expect(response.status).toBe(404);
    expect(client.rpc.mock.calls.map(([name]) => name)).not.toContain('submit_place_correction');
  });

  it('reports an unavailable profile as unavailable rather than as a bad request', async () => {
    getPublishedProfile.mockResolvedValue({ status: 'infrastructure_error' });
    const client = memberClient();

    expect((await POST(event(client, placeFieldCorrection()))).status).toBe(503);
  });

  it('rejects a field with no inline editor without reading the profile', async () => {
    const client = memberClient();
    const response = await POST(
      event(client, placeFieldCorrection({ field: 'description', value: 'A cafe.' }))
    );

    expect(response.status).toBe(400);
    expect(getPublishedProfile).not.toHaveBeenCalled();
  });

  it('never reads the Access Condition path for a Place field Correction', async () => {
    const client = memberClient();
    await POST(event(client, placeFieldCorrection()));

    expect(getStoredAccessCondition).not.toHaveBeenCalled();
  });
});

describe('the pending Correction read', () => {
  it('returns the caller open flags on this Place, addressing only', async () => {
    const client = memberClient();
    const response = await GET(readEvent(client));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pending: [
        {
          kind: 'correction',
          targetKind: 'place_field',
          targetField: 'name',
          accessConditionId: null,
          reportReason: null,
          status: 'submitted'
        },
        {
          kind: 'report',
          targetKind: 'access_condition',
          targetField: null,
          accessConditionId,
          reportReason: 'closed',
          status: 'needs_information'
        }
      ]
    });
    expect(client.rpc).toHaveBeenCalledWith('list_my_open_place_flags', {
      requested_place_id: placeId
    });
  });

  it('keeps the member-scoped projection out of every shared cache', async () => {
    const response = await GET(readEvent(memberClient()));

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('cookie');
  });

  it('requires a member before it reads anything', async () => {
    const client = memberClient();
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(readEvent(client));

    expect(response.status).toBe(401);
    expect(client.rpc.mock.calls.map(([name]) => name)).not.toContain('list_my_open_place_flags');
  });

  it('rejects a place id that is not a UUID', async () => {
    const client = memberClient();
    const response = await GET({
      cookies: {},
      locals: { supabase: client, requestId: crypto.randomUUID() },
      params: { id: 'not-a-uuid' },
      request: new Request('http://localhost/api/places/not-a-uuid/corrections'),
      url: new URL('http://localhost/api/places/not-a-uuid/corrections')
    } as never);

    expect(response.status).toBe(400);
  });

  it('reports an unreadable projection as unavailable rather than as an empty one', async () => {
    const client = memberClient();
    client.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_current_member_account')
        return { data: [{ member_id: 'member' }], error: null };
      return { data: null, error: { code: '08006' } };
    });

    const response = await GET(readEvent(client));

    expect(response.status).toBe(503);
  });

  it('refuses a row carrying a resolved status, which this read never promises', async () => {
    const client = memberClient();
    client.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_current_member_account')
        return { data: [{ member_id: 'member' }], error: null };
      return {
        data: [{ ...openFlagRows()[0], status: 'applied' }],
        error: null
      };
    });

    expect((await GET(readEvent(client))).status).toBe(503);
  });
});
