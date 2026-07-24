import { describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import { actions, load } from '../../../src/routes/[lang=lang]/account/keep-current/+page.server';

const taskRow = {
  task_id: 'dog_amenities:94930000-0000-4000-8000-000000000002:5',
  task_kind: 'dog_amenities',
  place_id: '94930000-0000-4000-8000-000000000002',
  place_name: 'Missing Amenities',
  municipality: 'kopavogur',
  category: 'park',
  current_value: { dog_amenities: [] },
  freshness_until: null
};

describe('Trusted Verification member page boundary', () => {
  it('loads safe tasks and caller-owned history only after the live trust check succeeds', async () => {
    const rpc = trustedRpc();

    await expect(load(eventWith(rpc) as never)).resolves.toMatchObject({
      canVerify: true,
      tasks: [
        {
          taskId: taskRow.task_id,
          taskKind: 'dog_amenities',
          placeName: 'Missing Amenities'
        }
      ],
      history: [],
      taskRequestIds: {
        [taskRow.task_id]: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        )
      }
    });
    expect(rpc).toHaveBeenCalledWith('list_trusted_verification_tasks', {
      requested_locale: 'en',
      requested_limit: 24
    });
    expect(rpc).toHaveBeenCalledWith('list_my_trusted_verification_submissions', {
      requested_locale: 'en',
      requested_limit: 30
    });
  });

  it('turns one task response into ordinary correction evidence with a stable command id', async () => {
    const rpc = trustedRpc();
    const commandId = '94990000-0000-4000-8000-000000000011';
    const request = formRequest({
      commandId,
      taskId: taskRow.task_id,
      amenities: 'water bowl, waste bags, water bowl',
      evidenceKind: 'direct_observation',
      evidenceSourceLabel: 'Member observation',
      evidenceCitation: 'Observed in person',
      evidenceObservedAt: '2026-07-24T12:00',
      explanation: 'I checked these amenities at the place.'
    });

    await expect(
      actions.default?.({
        ...eventWith(rpc),
        request
      } as never)
    ).resolves.toEqual({
      success: 'submitted',
      taskId: taskRow.task_id,
      weeklyActivated: true
    });
    expect(rpc).toHaveBeenCalledWith('submit_trusted_verification_task', {
      requested_task_id: taskRow.task_id,
      requested_response: { dog_amenities: ['water bowl', 'waste bags'] },
      requested_evidence: {
        kind: 'direct_observation',
        source_url: null,
        source_citation: 'Observed in person',
        source_label: 'Member observation',
        observed_at: '2026-07-24T12:00:00.000Z',
        source_metadata: {}
      },
      requested_explanation: 'I checked these amenities at the place.',
      command_request_id: commandId
    });
  });

  it('hides new tasks but preserves private history when live trust is unavailable', async () => {
    const rpc = trustedRpc({ trusted: false });

    await expect(load(eventWith(rpc) as never)).resolves.toMatchObject({
      canVerify: false,
      tasks: [],
      history: []
    });
  });
});

function trustedRpc({ trusted = true }: { trusted?: boolean } = {}) {
  return vi.fn(async (name: string) => {
    if (name === 'has_current_user_role') return { data: true, error: null };
    if (name === 'list_trusted_verification_tasks') {
      return trusted ? { data: [taskRow], error: null } : { data: null, error: { code: '42501' } };
    }
    if (name === 'list_my_trusted_verification_submissions') {
      return { data: [], error: null };
    }
    if (name === 'submit_trusted_verification_task') {
      return {
        data: [
          {
            submission_id: 'submission-1',
            flag_id: 'flag-1',
            outcome: 'submitted',
            activated_current_week: true,
            submitted_at: '2026-07-24T12:00:00Z'
          }
        ],
        error: null
      };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
}

function eventWith(rpc: ReturnType<typeof vi.fn>) {
  return {
    locals: {
      requestId: 'request-trusted-verification',
      copy: catalogues.en,
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
    url: new URL('https://hundavaent.test/en/account/keep-current')
  };
}

function formRequest(values: Record<string, string>): Request {
  return new Request('https://hundavaent.test/en/account/keep-current', {
    method: 'POST',
    body: new URLSearchParams(values)
  });
}
