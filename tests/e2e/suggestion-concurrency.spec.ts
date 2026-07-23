import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import type { Database, Json } from '$server/db/generated.types';

import {
  configureLocalSuggestionAbusePolicy,
  getLocalSupabaseStatus,
  localDatabaseContainer
} from './support/local-supabase';

let createdMemberId: string | undefined;

test.afterEach(async () => {
  if (!createdMemberId) return;

  const memberId = createdMemberId;
  createdMemberId = undefined;
  runSql(`
    set session_replication_role = replica;
    delete from private.activity_integrity_observations as observation
    where observation.member_id = '${memberId}'::uuid;
    delete from private.contributions as contribution
    where contribution.suggestion_id in (
      select suggestion.id
      from private.place_suggestions as suggestion
      where suggestion.member_id = '${memberId}'::uuid
    );
    delete from private.suggestion_status_events as status_event
    where status_event.suggestion_id in (
      select suggestion.id
      from private.place_suggestions as suggestion
      where suggestion.member_id = '${memberId}'::uuid
    );
    delete from private.place_suggestions as suggestion
    where suggestion.member_id = '${memberId}'::uuid;
    set session_replication_role = origin;
  `);

  const status = getLocalSupabaseStatus();
  const admin = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const deleted = await admin.auth.admin.deleteUser(memberId);
  expect(deleted.error).toBeNull();
});

test('same-request concurrent Suggestion submissions return one idempotent result', async () => {
  const status = getLocalSupabaseStatus();
  const email = `suggestion-race-${Date.now()}@example.invalid`;
  const password = `Race-${randomUUID()}`;
  const admin = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const memberId = created.data.user?.id;
  expect(memberId).toBeTruthy();
  if (!memberId) return;
  createdMemberId = memberId;

  runSql(`
    insert into private.member_accounts (user_id) values ('${memberId}'::uuid);
    insert into security.role_grants (user_id, role) values ('${memberId}'::uuid, 'member');
  `);
  await configureLocalSuggestionAbusePolicy();

  const client = createClient<Database>(status.apiUrl, status.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  expect(signedIn.error).toBeNull();

  const requestId = randomUUID();
  const proposal = {
    purpose: 'dog_access_destination',
    operator_name: 'Concurrent Suggestion operator',
    category: 'cafe',
    location: {
      address_line: 'Samhliða gata 1',
      locality: 'Reykjavík',
      postal_code: '101',
      municipality: 'reykjavik',
      latitude: 64.1466,
      longitude: -21.9426
    },
    translations: {
      is: { name: 'Samhliða tillaga', description: 'Samhliða prófun.' },
      en: { name: 'Concurrent Suggestion', description: 'A concurrency proof.' }
    },
    website_url: null,
    phone: null,
    opening_hours: {},
    dog_amenities: [],
    access_condition: {
      access_area: 'outdoors',
      access_area_note: null,
      restraint_condition: 'leash_required',
      restraint_note: null,
      dog_eligibility: { scope: 'all_dogs' },
      availability_window: {},
      permission_requirement: 'standing_permission'
    },
    evidence: {
      kind: 'member_report',
      source_url: 'https://example.invalid/concurrent-suggestion',
      source_citation: null,
      source_label: 'Concurrency source',
      observed_at: '2026-07-11T09:00:00Z',
      explanation: 'Dogs are explicitly allowed outdoors.',
      source_metadata: {}
    }
  } satisfies Json;

  const lock = holdMemberSuggestionLock(memberId);
  await waitForMemberLock(memberId);
  const submissions = Promise.all([
    client.rpc('submit_place_suggestion', {
      command_proposal: proposal,
      command_request_id: requestId
    }),
    client.rpc('submit_place_suggestion', {
      command_proposal: proposal,
      command_request_id: requestId
    })
  ]);
  await waitForExit(lock);
  const [first, second] = await submissions;

  expect(first.error).toBeNull();
  expect(second.error).toBeNull();
  expect(first.data?.[0]?.suggestion_id).toBe(second.data?.[0]?.suggestion_id);
  expect(
    queryScalar(`
    select count(*)
    from private.place_suggestions
    where member_id = '${memberId}'::uuid and request_id = '${requestId}'::uuid
  `)
  ).toBe('1');
  expect(
    queryScalar(`
    select count(*)
    from private.suggestion_status_events as event
    join private.place_suggestions as suggestion on suggestion.id = event.suggestion_id
    where suggestion.member_id = '${memberId}'::uuid
      and suggestion.request_id = '${requestId}'::uuid
      and event.status = 'submitted'
  `)
  ).toBe('1');
  expect(
    queryScalar(`
    select count(*)
    from private.activity_integrity_observations
    where member_id = '${memberId}'::uuid
      and source_kind = 'suggestion'
      and request_id = '${requestId}'::uuid
      and signal_kind = 'request_replay'
  `)
  ).toBe('1');
});

function holdMemberSuggestionLock(memberId: string): ChildProcessWithoutNullStreams {
  return spawn(
    'docker',
    [
      'exec',
      localDatabaseContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `select pg_advisory_lock(pg_catalog.hashtextextended('place-suggestion:${memberId}', 0)); select pg_sleep(2);`
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

async function waitForMemberLock(memberId: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const acquired = queryScalar(`
      select pg_try_advisory_lock(
        pg_catalog.hashtextextended('place-suggestion:${memberId}', 0)
      )
    `);
    if (acquired === 'f') return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('The independent session did not acquire the Member Suggestion lock');
}

function waitForExit(process: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.exitCode !== null) return process.exitCode === 0 ? resolve() : reject();
    process.once('error', reject);
    process.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Lock exit ${code}`))
    );
  });
}

function runSql(sql: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      localDatabaseContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql
    ],
    { encoding: 'utf8' }
  ).trim();
}

function queryScalar(sql: string): string {
  return runSql(sql).split('\n').at(-1) ?? '';
}
