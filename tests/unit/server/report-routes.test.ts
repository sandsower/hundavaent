import { describe, expect, it, vi } from 'vitest';

import { memberNoteMaximumLength } from '../../../src/lib/contributions/correction';

const { POST } = await import('../../../src/routes/api/places/[id]/reports/+server');

const placeId = '30000000-0000-4000-8000-000000000003';
const commandId = 'a2000000-0000-4000-8000-000000000001';

function submissionRow() {
  return {
    flag_id: 'flag-1',
    status: 'submitted',
    submitted_at: '2026-07-25T09:00:00Z',
    qualifying_action_recorded: true,
    activated_current_week: false,
    current_week_starts_on: '2026-07-20',
    current_week_ends_on: '2026-07-26',
    current_week_active: true
  };
}

function memberClient(
  reportResult: { data: unknown; error: { code: string } | null } | null = null
) {
  return {
    auth: {
      getUser: vi.fn(async (): Promise<{ data: { user: { id: string } | null }; error: null }> => ({
        data: { user: { id: 'member' } },
        error: null
      }))
    },
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      void args;
      if (name === 'get_current_member_account') {
        return { data: [{ member_id: 'member' }], error: null };
      }
      if (name === 'submit_place_report') {
        return reportResult ?? { data: [submissionRow()], error: null };
      }
      return { data: null, error: { code: 'unexpected' } };
    })
  };
}

function signedOutClient() {
  return {
    auth: {
      getUser: vi.fn(async (): Promise<{ data: { user: null }; error: null }> => ({
        data: { user: null },
        error: null
      }))
    },
    rpc: vi.fn(async () => ({ data: null, error: null }))
  };
}

function submittedCommand(client: ReturnType<typeof memberClient>): Record<string, unknown> {
  const call = client.rpc.mock.calls.find(([name]) => name === 'submit_place_report');
  if (!call) throw new Error('The Report RPC was never called');
  return (call[1] as { command_payload: Record<string, unknown> }).command_payload;
}

function event(
  client: { auth: unknown; rpc: unknown },
  body: unknown,
  headers: Record<string, string> = {}
) {
  return {
    cookies: {},
    locals: { supabase: client, requestId: crypto.randomUUID() },
    params: { id: placeId },
    request: new Request(`http://localhost/api/places/${placeId}/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': commandId, ...headers },
      body: JSON.stringify(body)
    }),
    url: new URL(`http://localhost/api/places/${placeId}/reports`)
  } as never;
}

describe('place-level Report API', () => {
  it('addresses the whole Place, carrying neither a field nor a Condition', async () => {
    const client = memberClient();
    const response = await POST(event(client, { reason: 'closed', note: null }));

    expect(response.status).toBe(200);
    const command = submittedCommand(client);
    expect(command).toMatchObject({
      target_kind: 'place',
      target_field: null,
      access_condition_id: null,
      place_id: placeId
    });
    // A Report alleges rather than proposes, and place_flag_kind_shape refuses a Correction on
    // this target outright.
    expect(command).not.toHaveProperty('proposed_value');
  });

  it('sends closed as its own reason and nothing else', async () => {
    const client = memberClient();
    await POST(event(client, { reason: 'closed', note: null }));

    expect(submittedCommand(client)).toMatchObject({
      report_reason: 'closed',
      is_safety_concern: false,
      successor_place_id: null
    });
  });

  it('sends moved with no successor, because the card never asks for one', async () => {
    // Naming the new location is successor_place on the report form, where a Member who actually
    // knows it can pick it. A card-level "moved" claims the move and nothing more.
    const client = memberClient();
    await POST(event(client, { reason: 'moved', note: null }));

    expect(submittedCommand(client)).toMatchObject({
      report_reason: 'moved',
      is_safety_concern: false,
      successor_place_id: null
    });
  });

  it('raises the safety bit on an unsafe report rather than waiting for moderator inference', async () => {
    const client = memberClient();
    await POST(event(client, { reason: 'unsafe', note: null }));

    expect(submittedCommand(client)).toMatchObject({
      report_reason: 'unsafe',
      is_safety_concern: true
    });
  });

  it('leaves the safety bit down on every other reason', async () => {
    for (const reason of ['closed', 'moved'] as const) {
      const client = memberClient();
      await POST(event(client, { reason, note: null }));
      expect(submittedCommand(client).is_safety_concern).toBe(false);
    }
  });

  it('synthesizes the evidence record instead of asking for the moderator worksheet', async () => {
    const client = memberClient();
    await POST(event(client, { reason: 'closed', note: null }));

    const command = submittedCommand(client);
    expect(command.evidence).toMatchObject({
      kind: 'member_report',
      source_url: null,
      source_citation: 'Reported closed from the place card.',
      source_label: 'Member report from the place page',
      source_metadata: {
        submissionProfile: 'inline-v1',
        surface: 'place-card',
        memberNoteProvided: false
      }
    });
    expect(command.explanation).toBe('Reported closed from the place card.');
  });

  it("routes the member's note to the explanation and never to the citation", async () => {
    const client = memberClient();
    const note = 'A neighbour said it shut for good in May.';
    await POST(event(client, { reason: 'closed', note }));

    const command = submittedCommand(client);
    expect(command.explanation).toBe(note);
    expect(command.evidence).toMatchObject({
      source_citation: 'Reported closed from the place card.',
      source_metadata: { memberNoteProvided: true }
    });
    expect(JSON.stringify(command.evidence)).not.toContain('neighbour');
  });

  it('accepts a note at the shared cap and rejects one past it', async () => {
    const atCap = memberClient();
    const capped = await POST(
      event(atCap, { reason: 'closed', note: 'a'.repeat(memberNoteMaximumLength) })
    );
    expect(capped.status).toBe(200);

    const overCap = memberClient();
    const rejected = await POST(
      event(overCap, { reason: 'closed', note: 'a'.repeat(memberNoteMaximumLength + 1) })
    );
    expect(rejected.status).toBe(400);
    expect(overCap.rpc.mock.calls.some(([name]) => name === 'submit_place_report')).toBe(false);
  });

  it('rejects a reason the card does not offer, including the ones the form still does', async () => {
    for (const reason of ['successor_place', 'inaccurate', 'misleading', 'obsolete', 'nonsense']) {
      const client = memberClient();
      const response = await POST(event(client, { reason, note: null }));
      expect(response.status).toBe(400);
      expect(client.rpc.mock.calls.some(([name]) => name === 'submit_place_report')).toBe(false);
    }
  });

  it('rejects a body with no reason at all', async () => {
    const client = memberClient();
    expect((await POST(event(client, { note: 'Something is off.' }))).status).toBe(400);
  });

  it('rejects a malformed idempotency key before touching the database', async () => {
    const client = memberClient();
    const response = await POST(
      event(client, { reason: 'closed', note: null }, { 'idempotency-key': 'not-a-uuid' })
    );

    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('passes the supplied idempotency key straight through as the request id', async () => {
    const client = memberClient();
    await POST(event(client, { reason: 'closed', note: null }));

    const call = client.rpc.mock.calls.find(([name]) => name === 'submit_place_report');
    expect((call?.[1] as { command_request_id: string }).command_request_id).toBe(commandId);
  });

  it('gates on membership before reading the body', async () => {
    const client = signedOutClient();
    const response = await POST(event(client, { reason: 'closed', note: null }));

    expect(response.status).toBe(401);
  });

  it('maps every database refusal onto the correction endpoint statuses', async () => {
    const cases: [string, number][] = [
      ['54000', 429],
      ['42501', 401],
      ['23505', 409],
      ['22023', 400],
      ['55000', 503],
      ['XX000', 503]
    ];

    for (const [code, status] of cases) {
      const client = memberClient({ data: null, error: { code } });
      const response = await POST(event(client, { reason: 'closed', note: null }));
      expect(response.status, `error ${code}`).toBe(status);
    }
  });

  it('returns the flag id and the weekly rhythm recognition on success', async () => {
    const client = memberClient();
    const response = await POST(event(client, { reason: 'unsafe', note: null }));

    expect(await response.json()).toMatchObject({
      status: 'submitted',
      flagId: 'flag-1',
      recognition: { action: 'report', recognized: true }
    });
  });
});
