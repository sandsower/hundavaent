import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '$server/db/generated.types';

export interface LocalSupabaseStatus {
  apiUrl: string;
  publishableKey: string;
  secretKey: string;
  inbucketUrl: string;
}

let cachedStatus: LocalSupabaseStatus | undefined;
const localSupabaseBinary = resolve(process.cwd(), 'node_modules/.bin/supabase');
const localSupabaseWorkdir = resolve(process.env.HUNDAVAENT_SUPABASE_WORKDIR ?? process.cwd());

function readLocalDatabaseContainer(): string {
  const configPath = resolve(localSupabaseWorkdir, 'supabase/config.toml');
  const projectId = readFileSync(configPath, 'utf8').match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];

  if (!projectId) {
    throw new Error(`Could not read project_id from ${configPath}`);
  }

  return `supabase_db_${projectId}`;
}

export const localDatabaseContainer = readLocalDatabaseContainer();
export const localMemberActivationSecret = 'local-member-activation-capability-secret-v1';

export function getLocalMemberAuthEnvironment(appOrigin: string): Record<string, string> {
  assertLocalEvaluationUrl(appOrigin);

  return {
    PUBLIC_APP_URL: appOrigin,
    AUTH_EMAIL_ENABLED: 'true',
    AUTH_FACEBOOK_ENABLED: 'false',
    MEMBER_ACTIVATION_SECRET: localMemberActivationSecret
  };
}

export function assertLocalEvaluationUrl(value: string): void {
  const hostname = new URL(value).hostname;
  if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '::1') {
    throw new Error(`Evaluation administration requires a local origin, received ${hostname}`);
  }
}

export function getLocalSupabaseStatus(): LocalSupabaseStatus {
  if (cachedStatus) {
    return cachedStatus;
  }

  const output = execFileSync(localSupabaseBinary, ['status', '-o', 'json'], {
    cwd: localSupabaseWorkdir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  const jsonStart = output.indexOf('{');

  if (jsonStart < 0) {
    throw new Error('Local Supabase status did not return JSON');
  }

  const status = JSON.parse(output.slice(jsonStart)) as Record<string, string>;

  if (!status.API_URL || !status.PUBLISHABLE_KEY || !status.SECRET_KEY || !status.INBUCKET_URL) {
    throw new Error('Local Supabase status is missing evaluation inputs');
  }

  cachedStatus = {
    apiUrl: status.API_URL,
    publishableKey: status.PUBLISHABLE_KEY,
    secretKey: status.SECRET_KEY,
    inbucketUrl: status.INBUCKET_URL
  };
  assertLocalEvaluationUrl(cachedStatus.apiUrl);
  assertLocalEvaluationUrl(cachedStatus.inbucketUrl);

  return cachedStatus;
}

export async function clearLocalEvaluationMailbox(): Promise<void> {
  const { inbucketUrl } = getLocalSupabaseStatus();
  const response = await fetch(`${inbucketUrl}/api/v1/messages`, { method: 'DELETE' });

  if (!response.ok) {
    throw new Error('Could not clear the local evaluation mailbox');
  }
}

export function resetLocalEvaluationDatabase(): void {
  const status = getLocalSupabaseStatus();
  assertLocalEvaluationUrl(status.apiUrl);
  execFileSync(localSupabaseBinary, ['db', 'reset'], {
    cwd: localSupabaseWorkdir,
    stdio: 'inherit'
  });
  cachedStatus = undefined;
}

export async function provisionLocalModerator(email: string): Promise<void> {
  const status = getLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: users, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (listError) {
    throw new Error('Could not inspect local evaluation users');
  }

  let user = users.users.find((candidate) => candidate.email === email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true
    });

    if (error || !data.user) {
      throw new Error('Could not create local evaluation Moderator');
    }

    user = data.user;
  }

  if (!/^[0-9a-f-]{36}$/i.test(user.id)) {
    throw new Error('Local evaluation Moderator has an invalid identifier');
  }

  const sql = `
    delete from private.access_dispute_evidence as evidence_link
    where evidence_link.dispute_id in (
      select dispute_record.id
      from private.access_disputes as dispute_record
      join private.places as place_record on place_record.id = dispute_record.place_id
      where place_record.created_by = '${user.id}'::uuid
    );

    delete from private.place_identity_transitions as transition_record
    where transition_record.predecessor_place_id in (
      select place_record.id
      from private.places as place_record
      where place_record.created_by = '${user.id}'::uuid
    ) or transition_record.successor_place_id in (
      select place_record.id
      from private.places as place_record
      where place_record.created_by = '${user.id}'::uuid
    );

    delete from private.freshness_tasks as freshness_task
    where freshness_task.place_id in (
      select place_record.id
      from private.places as place_record
      where place_record.created_by = '${user.id}'::uuid
    );

    delete from private.access_disputes as dispute_record
    where dispute_record.place_id in (
      select place_record.id
      from private.places as place_record
      where place_record.created_by = '${user.id}'::uuid
    );

    set session_replication_role = replica;
    create temporary table test_suggestion_cleanup_ids as
    select distinct suggestion.id
    from private.place_suggestions as suggestion
    left join private.suggestion_status_events as status_event
      on status_event.suggestion_id = suggestion.id
    left join private.places as candidate_place
      on candidate_place.id = suggestion.candidate_place_id
    left join private.places as duplicate_place
      on duplicate_place.id = suggestion.duplicate_place_id
    where status_event.moderator_id = '${user.id}'::uuid
      or candidate_place.created_by = '${user.id}'::uuid
      or duplicate_place.created_by = '${user.id}'::uuid
      or suggestion.proposal #>> '{evidence,source_url}' =
        'https://example.invalid/community-source';

    delete from private.contributions as contribution
    where contribution.suggestion_id in (select id from test_suggestion_cleanup_ids);

    delete from private.suggestion_status_events as status_event
    where status_event.suggestion_id in (select id from test_suggestion_cleanup_ids);

    delete from private.place_suggestions as suggestion
    where suggestion.id in (select id from test_suggestion_cleanup_ids);

    drop table test_suggestion_cleanup_ids;

    delete from private.verifications as verification_record
    where verification_record.access_condition_id in (
      select access_condition.id
      from private.access_conditions as access_condition
      join private.places as place_record on place_record.id = access_condition.place_id
        where place_record.created_by = '${user.id}'::uuid
      );

    delete from private.access_conditions as access_condition
    where access_condition.place_id in (
      select place_record.id
      from private.places as place_record
      where place_record.created_by = '${user.id}'::uuid
    ) and access_condition.supersedes_condition_id is not null;

    delete from private.access_conditions as access_condition
    where access_condition.place_id in (
      select place_record.id
      from private.places as place_record
      where place_record.created_by = '${user.id}'::uuid
    );

    delete from private.evidence as evidence_record
    where evidence_record.place_id in (
      select place_record.id
      from private.places as place_record
      where place_record.created_by = '${user.id}'::uuid
    );

    delete from private.place_translations as translation_record
    where translation_record.place_id in (
      select place_record.id
      from private.places as place_record
      where place_record.created_by = '${user.id}'::uuid
    );

    delete from private.places
    where created_by = '${user.id}'::uuid;

    delete from private.evidence as evidence_record
    where evidence_record.recorded_by = '${user.id}'::uuid
      and not exists (
        select 1
        from private.verification_evidence as evidence_link
        where evidence_link.evidence_id = evidence_record.id
      );

    delete from private.locations as location_record
    where not exists (
      select 1
      from private.places as place_record
      where place_record.location_id = location_record.id
    );

    delete from private.operators as operator_record
    where not exists (
      select 1
      from private.places as place_record
      where place_record.operator_id = operator_record.id
    );

    set session_replication_role = origin;

    select public.provision_moderator('${user.id}'::uuid);
  `;

  execFileSync(
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
      sql
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );

  await clearLocalEvaluationMailbox();
}

export async function configureLocalSuggestionAbusePolicy(): Promise<void> {
  const status = getLocalSupabaseStatus();
  const serviceClient = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await serviceClient.rpc('configure_suggestion_abuse_policy', {
    requested_policy_version: 'e2e-test-only-v1',
    requested_submission_window_seconds: 3600,
    requested_maximum_submissions: 10,
    requested_enabled: true
  });

  if (error) {
    throw new Error(`Could not configure the local Suggestion abuse policy: ${error.message}`);
  }
}

// The proximity assist ships disabled fail-closed in production (proximity awaits owner approval).
// This helper enables it for the e2e specs that must exercise the location-permission flows;
// other specs must never rely on it being enabled.
export async function configureLocalCheckInPolicy(proximityAssistEnabled: boolean): Promise<void> {
  const status = getLocalSupabaseStatus();
  const serviceClient = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await serviceClient.rpc('configure_check_in_policy', {
    requested_policy_version: 'e2e-test-only-v1',
    requested_proximity_assist_enabled: proximityAssistEnabled
  });

  if (error) {
    throw new Error(`Could not configure the local Check-in policy: ${error.message}`);
  }
}

// Removes every Check-in recorded for the given Place so a spec can start each scenario from a
// clean rolling-window state without waiting out the real 24-hour duplicate window.
export function clearLocalCheckIns(placeId: string): void {
  assertUuid(placeId, 'Check-in Place');
  const sql = `delete from private.check_ins where place_id = '${placeId}'::uuid;`;
  execFileSync(
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
      sql
    ],
    { stdio: 'ignore' }
  );
}

// Removes every Place media row and Storage object registered for the given Place. Used to
// return a shared evaluation fixture Place to its pristine state after an a11y/visual spec
// uploads real Evidence/Photo objects through the Moderator workspace.
export function clearLocalPlaceMedia(placeId: string): void {
  assertUuid(placeId, 'Place media Place');
  // storage.objects carries a protect_delete trigger that rejects direct SQL deletes unless the
  // storage.allow_delete_query setting opts in; this is exactly the accidental-orphan protection
  // it exists for, and a local test-fixture sweep is the deliberate case it allows.
  const sql = `
    set storage.allow_delete_query = 'true';
    delete from private.place_media where place_id = '${placeId}'::uuid;
    delete from storage.objects
    where bucket_id in ('place-evidence', 'place-photos')
      and name like '${placeId}/%';
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'ignore' }
  );
}

export function configureLocalContributorStatusPolicy(): Promise<void> {
  return upsertLocalContributorStatusPolicy(true);
}

// Restores the seeded "no qualification policy configured" world after a spec that enabled the
// e2e policy. The policy is a database-wide singleton, so leaving it enabled changes what the
// Moderator suggestion review page renders (the policy-missing note disappears) for every suite
// that shares this local database session afterwards, including the visual baselines.
export function disableLocalContributorStatusPolicy(): Promise<void> {
  return upsertLocalContributorStatusPolicy(false);
}

async function upsertLocalContributorStatusPolicy(enabled: boolean): Promise<void> {
  const status = getLocalSupabaseStatus();
  const serviceClient = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await serviceClient.rpc('configure_contributor_status_policy', {
    requested_policy_version: 'e2e-contributor-test-v1',
    requested_trusted_minimum_net_accepted: 1,
    requested_trusted_window_seconds: 31536000,
    requested_trusted_minimum_distinct_months: 1,
    requested_trusted_minimum_distinct_subjects: 1,
    requested_trusted_maximum_revoked_in_window: 0,
    requested_enabled: enabled
  });

  if (error) {
    throw new Error(`Could not configure the local Contributor status policy: ${error.message}`);
  }
}

// The Achievement engine ships fail-closed (no policy row in the seed, disabled in production
// until owner approval). These helpers enable it for the specs that exercise the Achievements
// surface and restore the seeded dark state afterwards - the policy is a database-wide singleton,
// so leaving it enabled would change what every later suite in this shared local database session
// renders on /account/achievements.
export function configureLocalAchievementPolicy(): Promise<void> {
  return upsertLocalAchievementPolicy(true);
}

export function disableLocalAchievementPolicy(): Promise<void> {
  return upsertLocalAchievementPolicy(false);
}

async function upsertLocalAchievementPolicy(enabled: boolean): Promise<void> {
  const status = getLocalSupabaseStatus();
  const serviceClient = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await serviceClient.rpc('configure_achievement_policy', {
    requested_policy_version: 'e2e-achievements-test-v1',
    requested_credit_spacing_minutes: 15,
    requested_enabled: enabled
  });

  if (error) {
    throw new Error(`Could not configure the local Achievement policy: ${error.message}`);
  }
}

// Inserts an unlock ledger row directly with a fixed earned_at so visual baselines never depend
// on the capture day's date. Unlock rows are immutable once written (earned_at can never be
// updated afterwards), so deterministic evidence must be inserted, not earned live and adjusted.
// `notified` controls the newly-earned indicator: an unacknowledged row (notified_at null) renders
// the one-time "new" badge on the member's next catalogue view.
export async function provisionLocalAchievementUnlock(
  memberEmail: string,
  achievementKey: string,
  earnedAt: string,
  notified: boolean
): Promise<void> {
  if (!/^[a-z0-9_]+$/.test(achievementKey)) {
    throw new Error(`Unexpected local Achievement key: ${achievementKey}`);
  }
  if (!Number.isFinite(Date.parse(earnedAt))) {
    throw new Error(`Unexpected local Achievement earned_at: ${earnedAt}`);
  }
  const memberId = await resolveLocalMemberIdByEmail(memberEmail);
  const notifiedAt = notified ? `'${earnedAt}'::timestamptz` : 'null::timestamptz';
  runLocalDatabaseSql(`
    insert into private.achievement_unlocks
      (member_id, achievement_key, definition_version, earned_at, notified_at)
    select '${memberId}'::uuid, '${achievementKey}', definition.version,
      '${earnedAt}'::timestamptz, ${notifiedAt}
    from private.achievement_definitions as definition
    where definition.key = '${achievementKey}'
    order by definition.version desc
    limit 1
    on conflict (member_id, achievement_key, definition_version) do nothing;
  `);
}

// Removes every unlock (recalculation history cascades) for the given member so a suite that
// shares a long-lived identity - the evaluation moderator - can restore the achievement-free
// state it found. Achievements are otherwise once-ever per member, which would make any repeated
// capture of the "newly earned" state nondeterministic.
export async function retireLocalMemberAchievements(memberEmail: string): Promise<void> {
  const memberId = await resolveLocalMemberIdByEmail(memberEmail);
  runLocalDatabaseSql(
    `delete from private.achievement_unlocks where member_id = '${memberId}'::uuid;`
  );
}

async function resolveLocalMemberIdByEmail(memberEmail: string): Promise<string> {
  const status = getLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const member = data?.users.find((candidate) => candidate.email === memberEmail);

  if (error || !member || !/^[0-9a-f-]{36}$/i.test(member.id)) {
    throw new Error(`Could not identify the local member fixture for ${memberEmail}`);
  }

  return member.id;
}

function runLocalDatabaseSql(sql: string): void {
  execFileSync(
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
      sql
    ],
    { stdio: 'ignore' }
  );
}

export interface LocalConfirmedContribution {
  suggestionId: string;
  contributionId: string;
  placeId: string;
}

// Confirmed Contribution fixture created directly via SQL (bypassing the moderator Suggestion
// review UI, which is already exercised end-to-end by member-suggestion.spec.ts) so contributor
// status tests can provision a qualifying history without repeating that whole flow.
export async function provisionLocalConfirmedContribution(
  memberEmail: string,
  moderatorEmail: string
): Promise<LocalConfirmedContribution> {
  const status = getLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const member = data?.users.find((candidate) => candidate.email === memberEmail);
  const moderator = data?.users.find((candidate) => candidate.email === moderatorEmail);

  if (
    error ||
    !member ||
    !moderator ||
    !/^[0-9a-f-]{36}$/i.test(member.id) ||
    !/^[0-9a-f-]{36}$/i.test(moderator.id)
  ) {
    throw new Error('Could not identify the local Contribution fixture identities');
  }

  const operatorId = randomUUID();
  const locationId = randomUUID();
  const placeId = randomUUID();
  const suggestionId = randomUUID();
  const contributionId = randomUUID();
  const confirmationRequestId = randomUUID();
  // private.locations has a uniqueness constraint on
  // (municipality, address_line, postal_code, latitude, longitude), so repeated fixture runs
  // against the same database need a distinct address_line each time.
  const addressLine = `Framlagsstaðagata ${locationId.slice(0, 8)}`;

  // A fully structured proposal, not a bare placeholder: the Moderator review page parses and
  // renders every field below, so an incomplete shape would 503 when the fixture's Suggestion is
  // opened through the real UI in the revocation step of the Contributor status journey.
  const contributionFixtureProposal = JSON.stringify({
    purpose: 'dog_access_destination',
    operator_name: 'Contributor status fixture operator',
    category: 'cafe',
    location: {
      address_line: addressLine,
      locality: 'Reykjavík',
      postal_code: '101',
      municipality: 'reykjavik',
      latitude: 64.145,
      longitude: -21.945
    },
    translations: {
      is: { name: 'Framlagsstaða prófun', description: 'Prófunarstaða til framlags.' },
      en: {
        name: 'Contribution status fixture',
        description: 'A confirmed Contribution fixture place.'
      }
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
      source_url: 'https://example.invalid/contributor-status-fixture',
      source_citation: null,
      source_label: 'Member supplied source',
      observed_at: '2026-07-11T09:00:00Z',
      explanation: 'The source explicitly permits dogs outdoors.',
      source_metadata: {}
    }
  }).replaceAll("'", "''");

  const sql = `
    insert into private.operators (id, name)
    values ('${operatorId}'::uuid, 'Contributor status fixture operator');

    insert into private.locations (
      id, address_line, locality, postal_code, municipality, latitude, longitude,
      geometry_precision, geometry_source
    ) values (
      '${locationId}'::uuid, '${addressLine}', 'Reykjavík', '101', 'reykjavik', 64.145, -21.945,
      'moderator_confirmed_point', 'Reviewed E2E fixture coordinate'
    );

    insert into private.places (id, operator_id, location_id, purpose, lifecycle, category)
    values (
      '${placeId}'::uuid, '${operatorId}'::uuid, '${locationId}'::uuid,
      'dog_access_destination', 'candidate', 'cafe'
    );

    insert into private.place_suggestions (
      id, member_id, request_id, proposal, status, candidate_place_id, reviewed_proposal, resolved_at
    ) values (
      '${suggestionId}'::uuid, '${member.id}'::uuid, '${suggestionId}'::uuid,
      '${contributionFixtureProposal}'::jsonb, 'accepted', '${placeId}'::uuid,
      '${contributionFixtureProposal}'::jsonb, now()
    );

    insert into private.contributions (
      id, suggestion_id, member_id, confirmed_by, confirmation_request_id, subject_place_id
    ) values (
      '${contributionId}'::uuid, '${suggestionId}'::uuid, '${member.id}'::uuid,
      '${moderator.id}'::uuid, '${confirmationRequestId}'::uuid, '${placeId}'::uuid
    );
  `;

  execFileSync(
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
      sql
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );

  return { suggestionId, contributionId, placeId };
}

export const localInactiveSuggestionPredecessor = {
  placeId: '35000000-0000-4000-8000-000000000088',
  operatorId: '15000000-0000-4000-8000-000000000088',
  locationId: '25000000-0000-4000-8000-000000000088'
} as const;

export const localCorrectedSuggestionPredecessor = {
  placeId: '35000000-0000-4000-8000-000000000087',
  operatorId: '15000000-0000-4000-8000-000000000087',
  locationId: '25000000-0000-4000-8000-000000000087'
} as const;

export function provisionLocalSuggestionIdentityFixtures(): void {
  const sql = `
    insert into private.operators (id, name) values
      ('${localCorrectedSuggestionPredecessor.operatorId}'::uuid, 'Corrected community cafe operator'),
      ('${localInactiveSuggestionPredecessor.operatorId}'::uuid, 'Accepted community cafe operator'),
      ('15000000-0000-4000-8000-000000000089'::uuid, 'Unrelated E2E operator')
    on conflict (id) do nothing;

    insert into private.locations (
      id, address_line, locality, postal_code, municipality, latitude, longitude,
      geometry_precision, geometry_source
    ) values
      ('${localCorrectedSuggestionPredecessor.locationId}'::uuid, 'Leiðrétt gata 48', 'Reykjavík', '105', 'reykjavik', 64.1325, -21.9024, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate'),
      ('${localInactiveSuggestionPredecessor.locationId}'::uuid, 'Tillögugata 47', 'Reykjavík', '101', 'reykjavik', 64.1511, -21.9201, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate'),
      ('25000000-0000-4000-8000-000000000089'::uuid, 'Fjarlæg gata 89', 'Mosfellsbær', '270', 'mosfellsbaer', 64.17, -21.70, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate')
    on conflict (id) do nothing;

    insert into private.places (
      id, operator_id, location_id, purpose, lifecycle, category
    ) values
      (
        '${localCorrectedSuggestionPredecessor.placeId}'::uuid,
        '${localCorrectedSuggestionPredecessor.operatorId}'::uuid,
        '${localCorrectedSuggestionPredecessor.locationId}'::uuid,
        'dog_access_destination', 'inactive', 'cafe'
      ),
      (
        '${localInactiveSuggestionPredecessor.placeId}'::uuid,
        '${localInactiveSuggestionPredecessor.operatorId}'::uuid,
        '${localInactiveSuggestionPredecessor.locationId}'::uuid,
        'dog_access_destination', 'inactive', 'cafe'
      ),
      (
        '35000000-0000-4000-8000-000000000089'::uuid,
        '15000000-0000-4000-8000-000000000089'::uuid,
        '25000000-0000-4000-8000-000000000089'::uuid,
        'dog_access_destination', 'candidate', 'service'
      )
    on conflict (id) do nothing;
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'ignore' }
  );
}

export async function configureLocalPlaceFlagAbusePolicy(): Promise<void> {
  const status = getLocalSupabaseStatus();
  const serviceClient = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await serviceClient.rpc('configure_place_flag_abuse_policy', {
    requested_policy_version: 'e2e-test-only-v1',
    requested_submission_window_seconds: 3600,
    requested_maximum_submissions: 10,
    requested_maximum_open: 5,
    requested_merge_window_seconds: 60,
    requested_enabled: true
  });

  if (error) {
    throw new Error(
      `Could not configure the local Correction/Report abuse policy: ${error.message}`
    );
  }
}

// Three dedicated published Places for correction-and-report Correction/Report journeys, kept fully separate
// from evaluationFixtureIds.places.published and the missing-place-suggestion Suggestion identity fixtures so an
// applied Correction, a confirmed-useful Report, an opened Access Dispute, and an inactivated
// Place never disturb state that other e2e/a11y/visual specs depend on.
export const localPlaceFlagFixtures = {
  correctable: {
    placeId: '93000000-0000-4000-8000-000000000001',
    operatorId: '91000000-0000-4000-8000-000000000001',
    locationId: '92000000-0000-4000-8000-000000000001',
    accessConditionId: '94000000-0000-4000-8000-000000000001',
    verificationId: '96000000-0000-4000-8000-000000000001',
    nameEn: 'Flag E2E Cafe',
    nameIs: 'Flögguð E2E kaffihús'
  },
  disputable: {
    placeId: '93000000-0000-4000-8000-000000000002',
    operatorId: '91000000-0000-4000-8000-000000000002',
    locationId: '92000000-0000-4000-8000-000000000002',
    accessConditionId: '94000000-0000-4000-8000-000000000002',
    verificationId: '96000000-0000-4000-8000-000000000002',
    nameEn: 'Flag E2E Park',
    nameIs: 'Flagguð E2E garður'
  },
  retirable: {
    placeId: '93000000-0000-4000-8000-000000000003',
    operatorId: '91000000-0000-4000-8000-000000000003',
    locationId: '92000000-0000-4000-8000-000000000003',
    accessConditionId: '94000000-0000-4000-8000-000000000003',
    verificationId: '96000000-0000-4000-8000-000000000003',
    nameEn: 'Flag E2E Closed Shop',
    nameIs: 'Flögguð E2E lokuð búð'
  }
} as const;

export function provisionLocalPlaceFlagFixtures(): void {
  const fixtures = Object.values(localPlaceFlagFixtures);
  const placeIdList = fixtures.map((fixture) => `'${fixture.placeId}'::uuid`).join(', ');
  const conditionIdList = fixtures
    .map((fixture) => `'${fixture.accessConditionId}'::uuid`)
    .join(', ');
  const evidenceValues = fixtures
    .map(
      (fixture, index) =>
        `('95000000-0000-4000-8000-00000000000${index + 1}'::uuid, '${fixture.placeId}'::uuid, 'official_website', 'https://example.invalid/flag-fixture-${index + 1}', 'Original policy', '2026-01-01T00:00:00Z', null)`
    )
    .join(',\n      ');
  const sql = `
    -- An earlier suite in this same local database session may have run the Correction/Report
    -- journeys already: an applied Correction, an opened Access Dispute (which supersedes the
    -- fixture Verification with a 'disputed' one), a Place inactivation transition, and the
    -- Corrections/Reports themselves all survive that run. The "on conflict" clauses below can
    -- re-publish the Places but can never undo that moderation state, so the report form would
    -- find no current verified Access Condition on a second run. Reset every derived record for
    -- these three deterministic fixture Places before provisioning them fresh.
    set session_replication_role = replica;

    delete from private.access_dispute_evidence as evidence_link
    where evidence_link.dispute_id in (
      select dispute_record.id
      from private.access_disputes as dispute_record
      where dispute_record.place_id in (${placeIdList})
    );

    delete from private.contributions as contribution
    where contribution.place_flag_id in (
      select flag_record.id
      from private.place_flags as flag_record
      where flag_record.place_id in (${placeIdList})
    );

    delete from private.place_flag_status_events as status_event
    where status_event.flag_id in (
      select flag_record.id
      from private.place_flags as flag_record
      where flag_record.place_id in (${placeIdList})
    );

    delete from private.place_flags where place_id in (${placeIdList});

    delete from private.access_disputes where place_id in (${placeIdList});

    delete from private.place_identity_transitions
    where predecessor_place_id in (${placeIdList})
      or successor_place_id in (${placeIdList});

    delete from private.freshness_tasks where place_id in (${placeIdList});

    delete from private.verification_evidence as evidence_link
    where evidence_link.verification_id in (
      select verification_record.id
      from private.verifications as verification_record
      join private.access_conditions as condition_record
        on condition_record.id = verification_record.access_condition_id
      where condition_record.place_id in (${placeIdList})
    );

    delete from private.verifications as verification_record
    where verification_record.access_condition_id in (
      select condition_record.id
      from private.access_conditions as condition_record
      where condition_record.place_id in (${placeIdList})
    );

    delete from private.access_conditions as condition_record
    where condition_record.place_id in (${placeIdList})
      and condition_record.id not in (${conditionIdList});

    update private.access_conditions
    set superseded_at = null
    where id in (${conditionIdList});

    set session_replication_role = origin;

    insert into private.operators (id, name) values
      ('${localPlaceFlagFixtures.correctable.operatorId}'::uuid, '${localPlaceFlagFixtures.correctable.nameEn} operator'),
      ('${localPlaceFlagFixtures.disputable.operatorId}'::uuid, '${localPlaceFlagFixtures.disputable.nameEn} operator'),
      ('${localPlaceFlagFixtures.retirable.operatorId}'::uuid, '${localPlaceFlagFixtures.retirable.nameEn} operator')
    on conflict (id) do nothing;

    insert into private.locations (
      id, address_line, locality, postal_code, municipality, latitude, longitude,
      geometry_precision, geometry_source
    ) values
      ('${localPlaceFlagFixtures.correctable.locationId}'::uuid, 'Flöggugata 1', 'Reykjavík', '101', 'reykjavik', 64.16, -21.96, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate'),
      ('${localPlaceFlagFixtures.disputable.locationId}'::uuid, 'Flöggugata 2', 'Reykjavík', '101', 'reykjavik', 64.161, -21.961, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate'),
      ('${localPlaceFlagFixtures.retirable.locationId}'::uuid, 'Flöggugata 3', 'Reykjavík', '101', 'reykjavik', 64.162, -21.962, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate')
    on conflict (id) do nothing;

    insert into private.places (
      id, operator_id, location_id, purpose, lifecycle, category, phone, website_url, version,
      published_at
    ) values
      (
        '${localPlaceFlagFixtures.correctable.placeId}'::uuid, '${localPlaceFlagFixtures.correctable.operatorId}'::uuid,
        '${localPlaceFlagFixtures.correctable.locationId}'::uuid, 'dog_access_destination', 'published', 'cafe',
        '+354 555 0100', 'https://example.invalid/flag-e2e-cafe', 1, '2026-01-01T00:00:00Z'
      ),
      (
        '${localPlaceFlagFixtures.disputable.placeId}'::uuid, '${localPlaceFlagFixtures.disputable.operatorId}'::uuid,
        '${localPlaceFlagFixtures.disputable.locationId}'::uuid, 'dog_access_destination', 'published', 'park',
        null, null, 1, '2026-01-01T00:00:00Z'
      ),
      (
        '${localPlaceFlagFixtures.retirable.placeId}'::uuid, '${localPlaceFlagFixtures.retirable.operatorId}'::uuid,
        '${localPlaceFlagFixtures.retirable.locationId}'::uuid, 'dog_access_destination', 'published', 'shop',
        null, null, 1, '2026-01-01T00:00:00Z'
      )
    on conflict (id) do update set
      lifecycle = excluded.lifecycle,
      published_at = excluded.published_at,
      phone = excluded.phone,
      website_url = excluded.website_url,
      version = excluded.version;

    insert into private.place_translations (place_id, locale, name, description) values
      ('${localPlaceFlagFixtures.correctable.placeId}'::uuid, 'is', '${localPlaceFlagFixtures.correctable.nameIs}', 'Upprunaleg lýsing.'),
      ('${localPlaceFlagFixtures.correctable.placeId}'::uuid, 'en', '${localPlaceFlagFixtures.correctable.nameEn}', 'Original description.'),
      ('${localPlaceFlagFixtures.disputable.placeId}'::uuid, 'is', '${localPlaceFlagFixtures.disputable.nameIs}', 'Upprunaleg lýsing.'),
      ('${localPlaceFlagFixtures.disputable.placeId}'::uuid, 'en', '${localPlaceFlagFixtures.disputable.nameEn}', 'Original description.'),
      ('${localPlaceFlagFixtures.retirable.placeId}'::uuid, 'is', '${localPlaceFlagFixtures.retirable.nameIs}', 'Upprunaleg lýsing.'),
      ('${localPlaceFlagFixtures.retirable.placeId}'::uuid, 'en', '${localPlaceFlagFixtures.retirable.nameEn}', 'Original description.')
    on conflict (place_id, locale) do nothing;

    insert into private.access_conditions (
      id, place_id, access_area, restraint_condition, permission_requirement
    ) values
      ('${localPlaceFlagFixtures.correctable.accessConditionId}'::uuid, '${localPlaceFlagFixtures.correctable.placeId}'::uuid, 'indoors', 'leash_required', 'standing_permission'),
      ('${localPlaceFlagFixtures.disputable.accessConditionId}'::uuid, '${localPlaceFlagFixtures.disputable.placeId}'::uuid, 'outdoors', 'off_leash_permitted', 'standing_permission'),
      ('${localPlaceFlagFixtures.retirable.accessConditionId}'::uuid, '${localPlaceFlagFixtures.retirable.placeId}'::uuid, 'indoors', 'carrier_required', 'ask_on_arrival')
    on conflict (id) do nothing;

    insert into private.evidence (id, place_id, kind, source_url, source_label, observed_at, recorded_by) values
      ${evidenceValues}
    on conflict (id) do nothing;

    insert into private.verifications (id, access_condition_id, status, verified_at, freshness_until) values
      ('${localPlaceFlagFixtures.correctable.verificationId}'::uuid, '${localPlaceFlagFixtures.correctable.accessConditionId}'::uuid, 'verified', '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z'),
      ('${localPlaceFlagFixtures.disputable.verificationId}'::uuid, '${localPlaceFlagFixtures.disputable.accessConditionId}'::uuid, 'verified', '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z'),
      ('${localPlaceFlagFixtures.retirable.verificationId}'::uuid, '${localPlaceFlagFixtures.retirable.accessConditionId}'::uuid, 'verified', '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z')
    on conflict (id) do nothing;

    insert into private.verification_evidence (verification_id, evidence_id) values
      ('${localPlaceFlagFixtures.correctable.verificationId}'::uuid, '95000000-0000-4000-8000-000000000001'::uuid),
      ('${localPlaceFlagFixtures.disputable.verificationId}'::uuid, '95000000-0000-4000-8000-000000000002'::uuid),
      ('${localPlaceFlagFixtures.retirable.verificationId}'::uuid, '95000000-0000-4000-8000-000000000003'::uuid)
    on conflict do nothing;
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'inherit' }
  );
}

// The three place_flags fixture Places are published (required so a Correction/Report can
// target a real verified Access Condition), so they otherwise remain visible in public
// discovery for the rest of the local database session. Retiring them as inactive keeps them
// out of both public discovery and the Candidate Place moderation queue used by later captures.
export function retireLocalPlaceFlagFixtures(): void {
  const ids = Object.values(localPlaceFlagFixtures)
    .map((fixture) => `'${fixture.placeId}'::uuid`)
    .join(', ');
  const sql = `update private.places set lifecycle = 'inactive', published_at = null where id in (${ids});`;
  execFileSync(
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
      sql
    ],
    { stdio: 'inherit' }
  );
}

// A dedicated published+verified Place for dog-friendliness Dog-Friendliness Rating journeys, isolated from
// every other fixture Place so submitted Ratings, Moderator exclusions, and the Summary policy
// threshold crossing never disturb state that other e2e/a11y/visual specs depend on.
export const localDogFriendlinessFixture = {
  placeId: '96000000-0000-4000-8000-000000000001',
  operatorId: '96100000-0000-4000-8000-000000000001',
  locationId: '96200000-0000-4000-8000-000000000001',
  accessConditionId: '96300000-0000-4000-8000-000000000001',
  verificationId: '96400000-0000-4000-8000-000000000001',
  evidenceId: '96500000-0000-4000-8000-000000000001',
  nameEn: 'Rating E2E Bistro',
  nameIs: 'Einkunna E2E bistro'
} as const;

export function provisionLocalDogFriendlinessFixture(): void {
  const fixture = localDogFriendlinessFixture;
  const sql = `
    -- An earlier suite in this same local database session may have run this journey already:
    -- current Ratings and a superseded fixture Verification would survive that run. Reset the
    -- current-row Rating table (append-only Rating events are never deleted; leftover history
    -- rows from an earlier run are harmless and are not read by any Summary or listing query).
    delete from private.dog_friendliness_ratings where place_id = '${fixture.placeId}'::uuid;

    set session_replication_role = replica;
    delete from private.verification_evidence as evidence_link
    where evidence_link.verification_id in (
      select verification_record.id
      from private.verifications as verification_record
      where verification_record.access_condition_id = '${fixture.accessConditionId}'::uuid
    );
    delete from private.verifications
    where access_condition_id = '${fixture.accessConditionId}'::uuid
      and id <> '${fixture.verificationId}'::uuid;
    update private.access_conditions
    set superseded_at = null
    where id = '${fixture.accessConditionId}'::uuid;
    set session_replication_role = origin;

    insert into private.operators (id, name) values
      ('${fixture.operatorId}'::uuid, '${fixture.nameEn} operator')
    on conflict (id) do nothing;

    insert into private.locations (
      id, address_line, locality, postal_code, municipality, latitude, longitude,
      geometry_precision, geometry_source
    ) values
      ('${fixture.locationId}'::uuid, 'Einkunnagata 99', 'Reykjavík', '101', 'reykjavik', 64.1499, -21.9399, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate')
    on conflict (id) do nothing;

    insert into private.places (
      id, operator_id, location_id, purpose, lifecycle, category, version, published_at
    ) values (
      '${fixture.placeId}'::uuid, '${fixture.operatorId}'::uuid, '${fixture.locationId}'::uuid,
      'dog_access_destination', 'published', 'cafe', 1, '2026-01-01T00:00:00Z'
    )
    on conflict (id) do update set
      lifecycle = excluded.lifecycle, published_at = excluded.published_at, version = excluded.version;

    insert into private.place_translations (place_id, locale, name, description) values
      ('${fixture.placeId}'::uuid, 'is', '${fixture.nameIs}', 'Upprunaleg lýsing.'),
      ('${fixture.placeId}'::uuid, 'en', '${fixture.nameEn}', 'Original description.')
    on conflict (place_id, locale) do nothing;

    insert into private.access_conditions (
      id, place_id, access_area, restraint_condition, permission_requirement
    ) values
      ('${fixture.accessConditionId}'::uuid, '${fixture.placeId}'::uuid, 'indoors', 'leash_required', 'standing_permission')
    on conflict (id) do nothing;

    insert into private.evidence (id, place_id, kind, source_url, source_label, observed_at) values
      ('${fixture.evidenceId}'::uuid, '${fixture.placeId}'::uuid, 'official_website', 'https://example.invalid/rating-e2e-bistro', 'Official site', '2026-01-01T00:00:00Z')
    on conflict (id) do nothing;

    insert into private.verifications (id, access_condition_id, status, verified_at, freshness_until) values
      ('${fixture.verificationId}'::uuid, '${fixture.accessConditionId}'::uuid, 'verified', '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z')
    on conflict (id) do nothing;

    insert into private.verification_evidence (verification_id, evidence_id) values
      ('${fixture.verificationId}'::uuid, '${fixture.evidenceId}'::uuid)
    on conflict do nothing;
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'inherit' }
  );
}

// The fixture Place is published (required so a Rating can target a real discoverable Place), so
// retiring it as inactive keeps it out of public discovery and later moderation queue captures.
export function retireLocalDogFriendlinessFixture(): void {
  const sql = `update private.places set lifecycle = 'inactive', published_at = null where id = '${localDogFriendlinessFixture.placeId}'::uuid;`;
  execFileSync(
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
      sql
    ],
    { stdio: 'inherit' }
  );
}

// A dedicated published+verified Place for private-rating-note Private Rating Note journeys, isolated from the
// correction-and-report (place-flag) and dog-friendliness (dog-friendliness) fixtures so submitted notes, explicit Report
// creation, and the Moderator disposition workspace never disturb state other specs depend on.
export const localPrivateRatingNoteFixture = {
  placeId: '97000000-0000-4000-8000-000000000001',
  operatorId: '97100000-0000-4000-8000-000000000001',
  locationId: '97200000-0000-4000-8000-000000000001',
  accessConditionId: '97300000-0000-4000-8000-000000000001',
  verificationId: '97400000-0000-4000-8000-000000000001',
  evidenceId: '97500000-0000-4000-8000-000000000001',
  nameEn: 'Private Note E2E Bistro',
  nameIs: 'Einkaskýringa E2E bistro'
} as const;

export function provisionLocalPrivateRatingNoteFixture(): void {
  const fixture = localPrivateRatingNoteFixture;
  const sql = `
    -- An earlier suite in this same local database session may have run this journey already:
    -- current Ratings, notes, and linked Reports would survive that run. dog_friendliness_ratings
    -- and place_flags hold a circular reference (linked_report_id / source_rating_id), and
    -- place_flag_status_events references place_flags too, so this cleanup runs with triggers
    -- (including FK enforcement) disabled rather than hand-ordering around the cycle.
    set session_replication_role = replica;
    delete from private.place_flag_status_events as event
    where event.flag_id in (
      select flag.id from private.place_flags as flag where flag.place_id = '${fixture.placeId}'::uuid
    );
    delete from private.contributions as contribution
    where contribution.place_flag_id in (
      select flag.id from private.place_flags as flag where flag.place_id = '${fixture.placeId}'::uuid
    );
    delete from private.place_flags where place_id = '${fixture.placeId}'::uuid;
    delete from private.dog_friendliness_ratings where place_id = '${fixture.placeId}'::uuid;
    set session_replication_role = origin;

    set session_replication_role = replica;
    delete from private.verification_evidence as evidence_link
    where evidence_link.verification_id in (
      select verification_record.id
      from private.verifications as verification_record
      where verification_record.access_condition_id = '${fixture.accessConditionId}'::uuid
    );
    delete from private.verifications
    where access_condition_id = '${fixture.accessConditionId}'::uuid
      and id <> '${fixture.verificationId}'::uuid;
    update private.access_conditions
    set superseded_at = null
    where id = '${fixture.accessConditionId}'::uuid;
    set session_replication_role = origin;

    insert into private.operators (id, name) values
      ('${fixture.operatorId}'::uuid, '${fixture.nameEn} operator')
    on conflict (id) do nothing;

    insert into private.locations (
      id, address_line, locality, postal_code, municipality, latitude, longitude,
      geometry_precision, geometry_source
    ) values
      ('${fixture.locationId}'::uuid, 'Einkaskýringagata 1', 'Reykjavík', '101', 'reykjavik', 64.1498, -21.9398, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate')
    on conflict (id) do nothing;

    insert into private.places (
      id, operator_id, location_id, purpose, lifecycle, category, version, published_at
    ) values (
      '${fixture.placeId}'::uuid, '${fixture.operatorId}'::uuid, '${fixture.locationId}'::uuid,
      'dog_access_destination', 'published', 'cafe', 1, '2026-01-01T00:00:00Z'
    )
    on conflict (id) do update set
      lifecycle = excluded.lifecycle, published_at = excluded.published_at, version = excluded.version;

    insert into private.place_translations (place_id, locale, name, description) values
      ('${fixture.placeId}'::uuid, 'is', '${fixture.nameIs}', 'Upprunaleg lýsing.'),
      ('${fixture.placeId}'::uuid, 'en', '${fixture.nameEn}', 'Original description.')
    on conflict (place_id, locale) do nothing;

    insert into private.access_conditions (
      id, place_id, access_area, restraint_condition, permission_requirement
    ) values
      ('${fixture.accessConditionId}'::uuid, '${fixture.placeId}'::uuid, 'indoors', 'leash_required', 'standing_permission')
    on conflict (id) do nothing;

    insert into private.evidence (id, place_id, kind, source_url, source_label, observed_at) values
      ('${fixture.evidenceId}'::uuid, '${fixture.placeId}'::uuid, 'official_website', 'https://example.invalid/private-note-e2e-bistro', 'Official site', '2026-01-01T00:00:00Z')
    on conflict (id) do nothing;

    insert into private.verifications (id, access_condition_id, status, verified_at, freshness_until) values
      ('${fixture.verificationId}'::uuid, '${fixture.accessConditionId}'::uuid, 'verified', '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z')
    on conflict (id) do nothing;

    insert into private.verification_evidence (verification_id, evidence_id) values
      ('${fixture.verificationId}'::uuid, '${fixture.evidenceId}'::uuid)
    on conflict do nothing;
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'inherit' }
  );
}

// The fixture Place is published (required so a Rating can target a real discoverable Place), so
// retiring it as inactive keeps it out of public discovery and later moderation queue captures.
export function retireLocalPrivateRatingNoteFixture(): void {
  const sql = `update private.places set lifecycle = 'inactive', published_at = null where id = '${localPrivateRatingNoteFixture.placeId}'::uuid;`;
  execFileSync(
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
      sql
    ],
    { stdio: 'inherit' }
  );
}

export function configureLocalPrivateRatingNotePolicy(): Promise<void> {
  return upsertLocalPrivateRatingNotePolicy(true);
}

// Restores the seeded "no policy configured" fail-closed world after a spec that enabled the e2e
// fixture threshold, so later suites in this shared local database session never see a note
// prompt that production configuration would still keep hidden.
export function disableLocalPrivateRatingNotePolicy(): Promise<void> {
  return upsertLocalPrivateRatingNotePolicy(false);
}

async function upsertLocalPrivateRatingNotePolicy(enabled: boolean): Promise<void> {
  const status = getLocalSupabaseStatus();
  const serviceClient = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await serviceClient.rpc('configure_private_rating_note_policy', {
    requested_policy_version: 'e2e-test-only-v1',
    requested_low_score_threshold: 2,
    requested_enabled: enabled
  });

  if (error) {
    throw new Error(`Could not configure the local Private Rating Note policy: ${error.message}`);
  }
}

export function configureLocalDogFriendlinessSummaryPolicy(): Promise<void> {
  return upsertLocalDogFriendlinessSummaryPolicy(true);
}

// Restores the seeded "no policy configured" fail-closed world after a spec that enabled the e2e
// fixture threshold, so later suites in this shared local database session never see a Summary
// that production configuration would still keep hidden.
export function disableLocalDogFriendlinessSummaryPolicy(): Promise<void> {
  return upsertLocalDogFriendlinessSummaryPolicy(false);
}

async function upsertLocalDogFriendlinessSummaryPolicy(enabled: boolean): Promise<void> {
  const status = getLocalSupabaseStatus();
  const serviceClient = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await serviceClient.rpc('configure_dog_friendliness_summary_policy', {
    requested_policy_version: 'e2e-test-only-v1',
    requested_minimum_eligible_count: 2,
    requested_recency_window_seconds: 31536000,
    requested_enabled: enabled
  });

  if (error) {
    throw new Error(
      `Could not configure the local Dog-Friendliness summary policy: ${error.message}`
    );
  }
}

// Grants an additional Venue Representative role to an already-signed-in Member, proving that
// status alone never bypasses the Moderator-only Rating exclusion/reinstatement boundary.
export async function grantLocalVenueRepresentativeRole(email: string): Promise<void> {
  const status = getLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const member = data?.users.find((candidate) => candidate.email === email);

  if (error || !member || !/^[0-9a-f-]{36}$/i.test(member.id)) {
    throw new Error('Could not identify the local Member to grant a Venue Representative role');
  }

  const sql = `
    insert into security.role_grants (user_id, role)
    values ('${member.id}'::uuid, 'venue_representative')
    on conflict (user_id, role) where revoked_at is null do nothing;
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'ignore' }
  );
}

const localPlaceFlagReviewFixtureId = '97000000-0000-4000-8000-000000000099';

export function clearLocalPlaceFlagReviewFixture(): void {
  const sql = `
    set session_replication_role = replica;
    delete from private.contributions
    where place_flag_id = '${localPlaceFlagReviewFixtureId}'::uuid;
    delete from private.place_flag_status_events
    where flag_id = '${localPlaceFlagReviewFixtureId}'::uuid;
    delete from private.place_flags
    where id = '${localPlaceFlagReviewFixtureId}'::uuid;
    set session_replication_role = origin;
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'ignore' }
  );
}

export async function provisionLocalPlaceFlagReviewFixture(email: string): Promise<string> {
  const status = getLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const member = data.users.find((candidate) => candidate.email === email);

  if (error || !member || !/^[0-9a-f-]{36}$/i.test(member.id)) {
    throw new Error('Could not identify the local Correction/Report fixture Member');
  }

  const { correctable } = localPlaceFlagFixtures;
  const flagId = localPlaceFlagReviewFixtureId;
  clearLocalPlaceFlagReviewFixture();
  const sql = `
    insert into private.place_flags (
      id, member_id, kind, place_id, target_kind, access_condition_id,
      current_value_snapshot, report_reason, is_safety_concern, explanation, evidence, request_id
    ) values (
      '${flagId}'::uuid, '${member.id}'::uuid, 'report', '${correctable.placeId}'::uuid,
      'access_condition', '${correctable.accessConditionId}'::uuid,
      '{"access_area":"indoors","access_area_note":null,"restraint_condition":"leash_required","restraint_note":null,"dog_eligibility":{"scope":"all_dogs"},"availability_window":{},"permission_requirement":"standing_permission"}'::jsonb,
      'unsafe', true, 'A dog was turned away despite the posted policy.',
      '{"kind":"member_report","source_url":null,"source_citation":"Personal visit","source_label":"Witnessed in person","observed_at":"2026-07-11T09:00:00Z","source_metadata":{}}'::jsonb,
      '98000000-0000-4000-8000-000000000099'::uuid
    );

    insert into private.place_flag_status_events (flag_id, status)
    values ('${flagId}'::uuid, 'submitted');
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'ignore' }
  );
  return flagId;
}

export async function provisionLocalSuggestionFixture(email: string): Promise<string> {
  const status = getLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const member = data.users.find((candidate) => candidate.email === email);

  if (error || !member || !/^[0-9a-f-]{36}$/i.test(member.id)) {
    throw new Error('Could not identify the local Suggestion fixture Member');
  }

  const suggestionId = '65000000-0000-4000-8000-000000000099';
  const sql = `
    set session_replication_role = replica;
    delete from private.contributions
    where suggestion_id between
      '65000000-0000-4000-8000-000000000094'::uuid and
      '65000000-0000-4000-8000-000000000099'::uuid;
    delete from private.suggestion_status_events
    where suggestion_id between
      '65000000-0000-4000-8000-000000000094'::uuid and
      '65000000-0000-4000-8000-000000000099'::uuid;
    delete from private.place_suggestions
    where id between
      '65000000-0000-4000-8000-000000000094'::uuid and
      '65000000-0000-4000-8000-000000000099'::uuid;
    set session_replication_role = origin;

    insert into private.place_suggestions (id, member_id, request_id, proposal, submitted_at)
    values (
      '${suggestionId}'::uuid,
      '${member.id}'::uuid,
      '85000000-0000-4000-8000-000000000099'::uuid,
      '{
        "purpose":"dog_access_destination",
        "operator_name":"Sjónrænn rekstraraðili",
        "category":"cafe",
        "location":{"address_line":"Sjónræn gata 99","locality":"Reykjavík","postal_code":"101","municipality":"reykjavik","latitude":64.18,"longitude":-21.82},
        "translations":{"is":{"name":"Sjónræn tillaga","description":"Einkatillaga til yfirferðar."},"en":{"name":"Visual Suggestion","description":"A private Suggestion ready for review."}},
        "opening_hours":{},
        "dog_amenities":[],
        "access_condition":{"access_area":"outdoors","access_area_note":null,"restraint_condition":"leash_required","restraint_note":null,"dog_eligibility":{"scope":"all_dogs"},"availability_window":{},"permission_requirement":"standing_permission"},
        "evidence":{"kind":"member_report","source_url":"https://example.invalid/visual-suggestion","source_citation":null,"source_label":"Member supplied source","observed_at":"2026-07-11T09:00:00Z","explanation":"The source explicitly permits dogs outdoors.","source_metadata":{}}
      }'::jsonb,
      '2026-07-11T09:00:00Z'::timestamptz
    );

    insert into private.place_suggestions (id, member_id, request_id, proposal, submitted_at)
    select
      '65000000-0000-4000-8000-000000000094'::uuid,
      submitted.member_id,
      '85000000-0000-4000-8000-000000000094'::uuid,
      jsonb_set(
        jsonb_set(
          submitted.proposal,
          '{translations,is,name}',
          to_jsonb('Næsta sjónræna tillaga'::text)
        ),
        '{translations,en,name}',
        to_jsonb('Next Visual Suggestion'::text)
      ),
      '2026-07-11T10:00:00Z'::timestamptz
    from private.place_suggestions as submitted
    where submitted.id = '${suggestionId}'::uuid;

    insert into private.place_suggestions (
      id,
      member_id,
      request_id,
      proposal,
      status,
      candidate_place_id,
      duplicate_place_id,
      reviewed_proposal,
      resolved_at
    )
    select
      outcome.id::uuid,
      submitted.member_id,
      outcome.request_id::uuid,
      jsonb_set(
        jsonb_set(submitted.proposal, '{translations,is,name}', to_jsonb(outcome.name_is)),
        '{translations,en,name}',
        to_jsonb(outcome.name_en)
      ),
      outcome.status::private.suggestion_status,
      case when outcome.status = 'accepted' then '30000000-0000-4000-8000-000000000001'::uuid end,
      case when outcome.status = 'duplicate' then '30000000-0000-4000-8000-000000000003'::uuid end,
      case when outcome.status = 'accepted' then submitted.proposal end,
      case when outcome.status in ('accepted', 'duplicate', 'rejected') then '2026-07-11T10:00:00Z'::timestamptz end
    from private.place_suggestions as submitted
    cross join (
      values
        ('65000000-0000-4000-8000-000000000095', '85000000-0000-4000-8000-000000000095', 'needs_information', 'Upplýsingar vantar', 'Needs information'),
        ('65000000-0000-4000-8000-000000000096', '85000000-0000-4000-8000-000000000096', 'accepted', 'Samþykkt tillaga', 'Accepted Suggestion'),
        ('65000000-0000-4000-8000-000000000097', '85000000-0000-4000-8000-000000000097', 'duplicate', 'Tvítekin tillaga', 'Duplicate Suggestion'),
        ('65000000-0000-4000-8000-000000000098', '85000000-0000-4000-8000-000000000098', 'rejected', 'Hafnað tillaga', 'Rejected Suggestion')
    ) as outcome(id, request_id, status, name_is, name_en)
    where submitted.id = '${suggestionId}'::uuid;

    insert into private.suggestion_status_events (
      suggestion_id,
      status,
      member_reason_is,
      member_reason_en,
      private_note,
      moderator_id,
      occurred_at
    ) values
      ('${suggestionId}'::uuid, 'submitted', null, null, null, null, '2026-07-11T09:00:00Z'),
      ('65000000-0000-4000-8000-000000000094'::uuid, 'submitted', null, null, null, null, '2026-07-11T10:00:00Z'),
      ('65000000-0000-4000-8000-000000000095'::uuid, 'needs_information', 'Vinsamlegast bættu við nýrri heimild.', 'Please add a newer source.', 'Private visual-only Moderator note.', '${member.id}'::uuid, '2026-07-11T10:00:00Z'),
      ('65000000-0000-4000-8000-000000000096'::uuid, 'accepted', 'Tillagan var samþykkt sem staður í vinnslu.', 'The Suggestion was accepted as a Candidate.', 'Private visual-only Moderator note.', '${member.id}'::uuid, '2026-07-11T10:00:00Z'),
      ('65000000-0000-4000-8000-000000000097'::uuid, 'duplicate', 'Staðurinn er þegar skráður.', 'This Place is already recorded.', 'Private visual-only Moderator note.', '${member.id}'::uuid, '2026-07-11T10:00:00Z'),
      ('65000000-0000-4000-8000-000000000098'::uuid, 'rejected', 'Heimildin staðfestir ekki aðgang hunda.', 'The source does not verify dog access.', 'Private visual-only Moderator note.', '${member.id}'::uuid, '2026-07-11T10:00:00Z');
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'ignore' }
  );

  return suggestionId;
}

export async function resolveLocalSuggestionFixtureAsModerator(
  moderatorEmail: string,
  suggestionId: string
): Promise<void> {
  assertUuid(suggestionId, 'Suggestion fixture');
  const status = getLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const moderator = data?.users.find((candidate) => candidate.email === moderatorEmail);

  if (error || !moderator) {
    throw new Error('Could not identify the local Suggestion fixture Moderator');
  }
  assertUuid(moderator.id, 'Suggestion fixture Moderator');

  const commandRequestId = randomUUID();
  const sql = `
    begin;
    select set_config('request.jwt.claim.sub', '${moderator.id}', true);
    select suggestion_id
    from public.resolve_place_suggestion(
      '${suggestionId}'::uuid,
      'rejected',
      'Tillagan var yfirfarin samhliða.',
      'The Suggestion was reviewed concurrently.',
      'The winning Moderator note.',
      null,
      null,
      null,
      null,
      false,
      '${commandRequestId}'::uuid
    );
    commit;
  `;
  const output = execFileSync(
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
  );

  if (!output.split('\n').includes(suggestionId)) {
    throw new Error('Could not resolve the local Suggestion fixture');
  }
}

export interface LocalSuggestionState {
  nameEn: string;
  status: string;
  candidatePlaceId: string | null;
  candidateLifecycle: string | null;
  candidateOperatorId: string | null;
  candidateLocationId: string | null;
  contributionCount: number;
}

export function getLocalSuggestionStates(): LocalSuggestionState[] {
  const sql = `
    select coalesce(json_agg(suggestion_state order by suggestion_state."nameEn"), '[]'::json)
    from (
      select
        suggestion.proposal #>> '{translations,en,name}' as "nameEn",
        suggestion.status::text as status,
        suggestion.candidate_place_id as "candidatePlaceId",
        place_record.lifecycle::text as "candidateLifecycle",
        place_record.operator_id as "candidateOperatorId",
        place_record.location_id as "candidateLocationId",
        (
          select count(*)::integer
          from private.contributions as contribution
          where contribution.suggestion_id = suggestion.id
        ) as "contributionCount"
      from private.place_suggestions as suggestion
      left join private.places as place_record on place_record.id = suggestion.candidate_place_id
    ) as suggestion_state
  `;
  const output = execFileSync(
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
  );

  return JSON.parse(output.trim()) as LocalSuggestionState[];
}

export interface LocalMemberIdentityState {
  id: string;
  identityProviders: string[];
  memberAccountCount: number;
  memberRoleCount: number;
}

export async function getLocalMemberIdentityState(
  email: string
): Promise<LocalMemberIdentityState> {
  const status = getLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find((candidate) => candidate.email === email);

  if (error || !user || !/^[0-9a-f-]{36}$/i.test(user.id)) {
    throw new Error('Could not identify the local Member');
  }

  const sql = `
    select json_build_object(
      'identityProviders', (
        select coalesce(json_agg(identity_record.provider order by identity_record.provider), '[]'::json)
        from auth.identities as identity_record
        where identity_record.user_id = '${user.id}'::uuid
      ),
      'memberAccountCount', (
        select count(*)
        from private.member_accounts as member_account
        where member_account.user_id = '${user.id}'::uuid
      ),
      'memberRoleCount', (
        select count(*)
        from security.role_grants as role_grant
        where role_grant.user_id = '${user.id}'::uuid
          and role_grant.role = 'member'
          and role_grant.revoked_at is null
      )
    )
  `;
  const output = execFileSync(
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
  );
  const state = JSON.parse(output.trim()) as {
    identityProviders?: unknown;
    memberAccountCount?: unknown;
    memberRoleCount?: unknown;
  };

  if (
    !Array.isArray(state.identityProviders) ||
    !state.identityProviders.every((provider) => typeof provider === 'string') ||
    typeof state.memberAccountCount !== 'number' ||
    !Number.isSafeInteger(state.memberAccountCount) ||
    typeof state.memberRoleCount !== 'number' ||
    !Number.isSafeInteger(state.memberRoleCount)
  ) {
    throw new Error('Could not inspect the local Member projection');
  }

  return {
    id: user.id,
    identityProviders: state.identityProviders,
    memberAccountCount: state.memberAccountCount,
    memberRoleCount: state.memberRoleCount
  };
}

export interface LocalAuthPersistenceCounts {
  authUsers: number;
  authIdentities: number;
  memberAccounts: number;
  memberRoles: number;
}

export function getLocalAuthPersistenceCounts(): LocalAuthPersistenceCounts {
  const sql = `
    select json_build_object(
      'authUsers', (select count(*) from auth.users),
      'authIdentities', (select count(*) from auth.identities),
      'memberAccounts', (select count(*) from private.member_accounts),
      'memberRoles', (
        select count(*)
        from security.role_grants as role_grant
        where role_grant.role = 'member'
          and role_grant.revoked_at is null
      )
    )
  `;
  const output = execFileSync(
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
  );
  const counts = JSON.parse(output.trim()) as Partial<LocalAuthPersistenceCounts>;

  if (
    typeof counts.authUsers !== 'number' ||
    !Number.isSafeInteger(counts.authUsers) ||
    typeof counts.authIdentities !== 'number' ||
    !Number.isSafeInteger(counts.authIdentities) ||
    typeof counts.memberAccounts !== 'number' ||
    !Number.isSafeInteger(counts.memberAccounts) ||
    typeof counts.memberRoles !== 'number' ||
    !Number.isSafeInteger(counts.memberRoles)
  ) {
    throw new Error('Could not inspect local Auth persistence counts');
  }

  return counts as LocalAuthPersistenceCounts;
}

export interface LocalPublicationAudit {
  actorId: string;
  action: string;
  requestId: string;
}

export function getLocalPublicationAudit(placeId: string): LocalPublicationAudit[] {
  if (!/^[0-9a-f-]{36}$/i.test(placeId)) {
    throw new Error('Publication audit Place identifier is invalid');
  }

  const sql = `
    select coalesce(json_agg(audit_record order by audit_record.action), '[]'::json)
    from (
      select
        actor_id as "actorId",
        action,
        request_id as "requestId"
      from private.audit_events
      where subject_type = 'place'
        and subject_id = '${placeId}'::uuid
        and action in ('place.verified', 'place.published')
    ) as audit_record
  `;
  const output = execFileSync(
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
  );

  return JSON.parse(output) as LocalPublicationAudit[];
}

export function openEveryLocalAccessDispute(placeId: string): string[] {
  assertUuid(placeId, 'Lifecycle Place');
  const sql = `
    select set_config('request.jwt.claim.sub', place_record.created_by::text, false)
    from private.places as place_record
    where place_record.id = '${placeId}'::uuid;

    select coalesce(json_agg(dispute_result.dispute_id order by dispute_result.dispute_id), '[]'::json)
    from private.access_conditions as condition_record
    join private.verifications as verification_record
      on verification_record.access_condition_id = condition_record.id
      and verification_record.status = 'verified'
      and verification_record.superseded_at is null
    cross join lateral public.open_access_dispute(
      jsonb_build_object(
        'access_condition_id', condition_record.id,
        'expected_verification_id', verification_record.id,
        'opened_at', clock_timestamp(),
        'reason', 'End-to-end contradictory access report',
        'evidence', jsonb_build_object(
          'kind', 'direct_observation',
          'source_citation', 'End-to-end visit for ' || condition_record.id,
          'source_label', 'End-to-end contradiction',
          'observed_at', clock_timestamp()
        )
      ),
      extensions.gen_random_uuid()
    ) as dispute_result
    where condition_record.place_id = '${placeId}'::uuid
      and condition_record.superseded_at is null;
  `;

  return runLocalJsonSql<string[]>(sql);
}

export function resolveEveryLocalAccessDispute(placeId: string): string[] {
  assertUuid(placeId, 'Lifecycle Place');
  const sql = `
    select set_config('request.jwt.claim.sub', place_record.created_by::text, false)
    from private.places as place_record
    where place_record.id = '${placeId}'::uuid;

    select coalesce(json_agg(resolution_result.verification_id order by resolution_result.verification_id), '[]'::json)
    from private.access_disputes as dispute_record
    cross join lateral public.resolve_access_dispute(
      jsonb_build_object(
        'dispute_id', dispute_record.id,
        'outcome', 'dismissed',
        'resolved_at', clock_timestamp(),
        'freshness_until', clock_timestamp() + interval '6 months',
        'resolution_notes', 'End-to-end access reconfirmation',
        'evidence', jsonb_build_object(
          'kind', 'venue_representative',
          'source_citation', 'End-to-end venue confirmation for ' || dispute_record.id,
          'source_label', 'End-to-end resolution',
          'observed_at', clock_timestamp()
        )
      ),
      extensions.gen_random_uuid()
    ) as resolution_result
    where dispute_record.place_id = '${placeId}'::uuid
      and dispute_record.status = 'open';
  `;

  return runLocalJsonSql<string[]>(sql);
}

export interface LocalFreshnessRaceResult {
  displacedVerificationTaskCount: number;
  activeVerificationCount: number;
}

export async function proveLocalReconfirmationSchedulerSerialization(
  placeId: string
): Promise<LocalFreshnessRaceResult> {
  assertUuid(placeId, 'Lifecycle Place');
  const fixture = runLocalJsonSql<{
    actorId: string;
    placeId: string;
    conditionId: string;
    verificationId: string;
  }>(`
    with target as (
      select
        place_record.created_by as actor_id,
        condition_record.id as condition_id,
        verification_record.id as verification_id
      from private.places as place_record
      join private.access_conditions as condition_record
        on condition_record.place_id = place_record.id
        and condition_record.superseded_at is null
      join private.verifications as verification_record
        on verification_record.access_condition_id = condition_record.id
        and verification_record.status = 'verified'
        and verification_record.superseded_at is null
      where place_record.id = '${placeId}'::uuid
      order by condition_record.id
      limit 1
    ), expired as (
      update private.verifications as verification_record
      set freshness_until = greatest(
        verification_record.verified_at + interval '1 microsecond',
        clock_timestamp() - interval '1 microsecond'
      )
      from target
      where verification_record.id = target.verification_id
      returning target.actor_id, target.condition_id, target.verification_id
    )
    select json_build_object(
      'actorId', expired.actor_id,
      'placeId', '${placeId}'::uuid,
      'conditionId', expired.condition_id,
      'verificationId', expired.verification_id
    )
    from expired
  `);
  assertUuid(fixture.actorId, 'Lifecycle actor');
  assertUuid(fixture.placeId, 'Lifecycle Place');
  assertUuid(fixture.conditionId, 'Access Condition');
  assertUuid(fixture.verificationId, 'Verification');

  const reconfirmation = spawnLocalPsql(`
    begin;
    select set_config('request.jwt.claim.sub', '${fixture.actorId}', true);
    select 'RECONFIRMATION_LOCKED'
    from private.places
    where id = '${fixture.placeId}'::uuid
    for update;
    select pg_sleep(1);
    select * from public.reconfirm_access_condition(
      jsonb_build_object(
        'access_condition_id', '${fixture.conditionId}',
        'expected_verification_id', '${fixture.verificationId}',
        'verified_at', clock_timestamp(),
        'freshness_until', clock_timestamp() + interval '6 months',
        'evidence', jsonb_build_object(
          'kind', 'official_website',
          'source_url', 'https://example.invalid/concurrency-reconfirmation',
          'source_label', 'Concurrent reconfirmation policy',
          'observed_at', clock_timestamp()
        )
      ),
      extensions.gen_random_uuid()
    );
    commit;
  `);

  await reconfirmation.waitForOutput('RECONFIRMATION_LOCKED');
  const scheduler = spawnLocalPsql(`
    begin;
    select set_config('request.jwt.claim.sub', '${fixture.actorId}', true);
    select * from public.schedule_reconfirmation_due(
      clock_timestamp(), extensions.gen_random_uuid()
    );
    commit;
  `);

  await Promise.all([reconfirmation.completed, scheduler.completed]);

  return runLocalJsonSql<LocalFreshnessRaceResult>(`
    select json_build_object(
      'displacedVerificationTaskCount', (
        select count(*)
        from private.freshness_tasks
        where verification_id = '${fixture.verificationId}'::uuid
      ),
      'activeVerificationCount', (
        select count(*)
        from private.verifications
        where access_condition_id = '${fixture.conditionId}'::uuid
          and status = 'verified'
          and superseded_at is null
      )
    )
  `);
}

export interface LocalInactivityRaceResult {
  schedulerPlaceLifecycle: string;
  schedulerTaskCount: number;
  disputePlaceLifecycle: string;
  disputeCount: number;
  disputeEvidenceCount: number;
  disputeCurrentVerificationCount: number;
}

export async function proveLocalInactivitySerialization(
  sourcePlaceId: string
): Promise<LocalInactivityRaceResult> {
  assertUuid(sourcePlaceId, 'Lifecycle source Place');
  const source = runLocalJsonSql<{ actorId: string; operatorId: string }>(`
    select json_build_object(
      'actorId', place_record.created_by,
      'operatorId', place_record.operator_id
    )
    from private.places place_record
    where place_record.id = '${sourcePlaceId}'::uuid
  `);
  assertUuid(source.actorId, 'Lifecycle actor');
  assertUuid(source.operatorId, 'Lifecycle Operator');

  const schedulerFixture = createRaceFixtureIds();
  const disputeFixture = createRaceFixtureIds();
  const schedulerPurpose = `scheduler_race_${schedulerFixture.placeId.replaceAll('-', '')}`;
  const disputePurpose = `dispute_race_${disputeFixture.placeId.replaceAll('-', '')}`;

  runLocalJsonSql<LocalInactivityRaceResult>(`
    insert into private.locations (
      id, address_line, locality, postal_code, municipality, latitude, longitude,
      geometry_precision, geometry_source
    ) values
      ('${schedulerFixture.locationId}', 'Scheduler Race ${schedulerFixture.placeId.slice(0, 8)}', 'Reykjavík', '101', 'reykjavik', 64.151, -21.951, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate'),
      ('${disputeFixture.locationId}', 'Dispute Race ${disputeFixture.placeId.slice(0, 8)}', 'Reykjavík', '101', 'reykjavik', 64.152, -21.952, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate');

    insert into private.places (
      id, operator_id, location_id, purpose, lifecycle, category, version,
      published_at, created_by
    ) values
      ('${schedulerFixture.placeId}', '${source.operatorId}', '${schedulerFixture.locationId}', '${schedulerPurpose}', 'published', 'cafe', 1, clock_timestamp(), '${source.actorId}'),
      ('${disputeFixture.placeId}', '${source.operatorId}', '${disputeFixture.locationId}', '${disputePurpose}', 'published', 'cafe', 1, clock_timestamp(), '${source.actorId}');

    insert into private.place_translations (place_id, locale, name, description) values
      ('${schedulerFixture.placeId}', 'is', 'Tímasetningarárekstur', 'Prófun á lokaröð.'),
      ('${schedulerFixture.placeId}', 'en', 'Scheduler race', 'Lifecycle lock-order proof.'),
      ('${disputeFixture.placeId}', 'is', 'Ágreiningsárekstur', 'Prófun á lokaröð.'),
      ('${disputeFixture.placeId}', 'en', 'Dispute race', 'Lifecycle lock-order proof.');

    insert into private.access_conditions (
      id, place_id, access_area, restraint_condition, dog_eligibility,
      availability_window, permission_requirement, created_by
    ) values
      ('${schedulerFixture.conditionId}', '${schedulerFixture.placeId}', 'indoors', 'leash_required', '{"scope":"all_dogs"}'::jsonb, '{}'::jsonb, 'standing_permission', '${source.actorId}'),
      ('${disputeFixture.conditionId}', '${disputeFixture.placeId}', 'indoors', 'leash_required', '{"scope":"all_dogs"}'::jsonb, '{}'::jsonb, 'standing_permission', '${source.actorId}');

    insert into private.evidence (
      id, place_id, kind, source_citation, source_label, observed_at, recorded_by
    ) values
      ('${schedulerFixture.evidenceId}', '${schedulerFixture.placeId}', 'direct_observation', 'Scheduler race fixture', 'Scheduler race source', clock_timestamp() - interval '1 year', '${source.actorId}'),
      ('${disputeFixture.evidenceId}', '${disputeFixture.placeId}', 'direct_observation', 'Dispute race fixture', 'Dispute race source', clock_timestamp() - interval '1 year', '${source.actorId}');

    insert into private.verifications (
      id, access_condition_id, status, verified_by, verified_at, freshness_until
    ) values
      ('${schedulerFixture.verificationId}', '${schedulerFixture.conditionId}', 'verified', '${source.actorId}', clock_timestamp() - interval '1 year', clock_timestamp() - interval '1 microsecond'),
      ('${disputeFixture.verificationId}', '${disputeFixture.conditionId}', 'verified', '${source.actorId}', clock_timestamp() - interval '1 year', clock_timestamp() + interval '1 year');

    insert into private.verification_evidence (verification_id, evidence_id) values
      ('${schedulerFixture.verificationId}', '${schedulerFixture.evidenceId}'),
      ('${disputeFixture.verificationId}', '${disputeFixture.evidenceId}');

    select json_build_object(
      'schedulerPlaceLifecycle', 'published',
      'schedulerTaskCount', 0,
      'disputePlaceLifecycle', 'published',
      'disputeCount', 0,
      'disputeEvidenceCount', 1,
      'disputeCurrentVerificationCount', 1
    )
  `);

  const schedulerInactivity = spawnInactivityTransition(
    schedulerFixture.placeId,
    source.actorId,
    'INACTIVITY_SCHEDULER_LOCKED'
  );
  await schedulerInactivity.waitForOutput('INACTIVITY_SCHEDULER_LOCKED');
  const scheduler = spawnLocalPsql(`
    begin;
    select set_config('request.jwt.claim.sub', '${source.actorId}', true);
    select * from public.schedule_reconfirmation_due(
      clock_timestamp(), extensions.gen_random_uuid()
    );
    commit;
  `);
  await Promise.all([schedulerInactivity.completed, scheduler.completed]);

  const disputeInactivity = spawnInactivityTransition(
    disputeFixture.placeId,
    source.actorId,
    'INACTIVITY_DISPUTE_LOCKED'
  );
  await disputeInactivity.waitForOutput('INACTIVITY_DISPUTE_LOCKED');
  const disputeOpening = spawnLocalPsql(`
    begin;
    select set_config('request.jwt.claim.sub', '${source.actorId}', true);
    do $block$
    begin
      perform * from public.open_access_dispute(
        jsonb_build_object(
          'access_condition_id', '${disputeFixture.conditionId}',
          'expected_verification_id', '${disputeFixture.verificationId}',
          'opened_at', clock_timestamp(),
          'reason', 'Concurrent inactive dispute',
          'evidence', jsonb_build_object(
            'kind', 'direct_observation',
            'source_citation', 'Concurrent inactive visit',
            'source_label', 'Concurrent inactive contradiction',
            'observed_at', clock_timestamp()
          )
        ),
        extensions.gen_random_uuid()
      );
      raise exception 'Inactive Place unexpectedly accepted a dispute';
    exception
      when serialization_failure then null;
    end
    $block$;
    commit;
  `);
  await Promise.all([disputeInactivity.completed, disputeOpening.completed]);

  return runLocalJsonSql<LocalInactivityRaceResult>(`
    select json_build_object(
      'schedulerPlaceLifecycle', (
        select lifecycle::text from private.places where id = '${schedulerFixture.placeId}'
      ),
      'schedulerTaskCount', (
        select count(*) from private.freshness_tasks
        where verification_id = '${schedulerFixture.verificationId}'
      ),
      'disputePlaceLifecycle', (
        select lifecycle::text from private.places where id = '${disputeFixture.placeId}'
      ),
      'disputeCount', (
        select count(*) from private.access_disputes
        where access_condition_id = '${disputeFixture.conditionId}'
      ),
      'disputeEvidenceCount', (
        select count(*) from private.evidence where place_id = '${disputeFixture.placeId}'
      ),
      'disputeCurrentVerificationCount', (
        select count(*) from private.verifications
        where access_condition_id = '${disputeFixture.conditionId}'
          and status = 'verified'
          and superseded_at is null
      )
    )
  `);
}

interface RaceFixtureIds {
  locationId: string;
  placeId: string;
  conditionId: string;
  evidenceId: string;
  verificationId: string;
}

function createRaceFixtureIds(): RaceFixtureIds {
  return {
    locationId: randomUUID(),
    placeId: randomUUID(),
    conditionId: randomUUID(),
    evidenceId: randomUUID(),
    verificationId: randomUUID()
  };
}

function spawnInactivityTransition(
  placeId: string,
  actorId: string,
  marker: string
): LocalPsqlProcess {
  assertUuid(placeId, 'Inactivity race Place');
  assertUuid(actorId, 'Inactivity race actor');
  return spawnLocalPsql(`
    begin;
    select set_config('request.jwt.claim.sub', '${actorId}', true);
    select '${marker}' from private.places where id = '${placeId}'::uuid for update;
    select pg_sleep(1);
    select * from public.transition_place_identity(
      jsonb_build_object(
        'place_id', '${placeId}',
        'expected_version', 1,
        'kind', 'inactive',
        'decided_at', clock_timestamp(),
        'decision_notes', 'Deterministic inactivity race'
      ),
      extensions.gen_random_uuid()
    );
    commit;
  `);
}

interface LocalPsqlProcess {
  completed: Promise<void>;
  waitForOutput(marker: string): Promise<void>;
}

function spawnLocalPsql(sql: string): LocalPsqlProcess {
  const child = spawn(
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
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let stdout = '';
  let stderr = '';
  const listeners = new Set<() => void>();
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
    for (const listener of listeners) listener();
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const completed = new Promise<void>((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('close', (code) => {
      for (const listener of listeners) listener();
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Local SQL process failed: ${stderr.trim()}`));
    });
  });

  return {
    completed,
    waitForOutput(marker) {
      if (stdout.includes(marker)) return Promise.resolve();
      return new Promise<void>((resolvePromise, rejectPromise) => {
        const deadline = setTimeout(() => {
          listeners.delete(check);
          rejectPromise(new Error(`Timed out waiting for local SQL marker ${marker}`));
        }, 5_000);
        const check = () => {
          if (!stdout.includes(marker)) return;
          clearTimeout(deadline);
          listeners.delete(check);
          resolvePromise();
        };
        listeners.add(check);
        void completed.catch((error: unknown) => {
          clearTimeout(deadline);
          listeners.delete(check);
          rejectPromise(error);
        });
      });
    }
  };
}

export function setLocalPlaceLifecycle(
  placeId: string,
  lifecycle: 'candidate' | 'published' | 'inactive'
): void {
  if (!/^[0-9a-f-]{36}$/i.test(placeId)) {
    throw new Error('Local lifecycle Place identifier is invalid');
  }

  const sql = `
    update private.places
    set lifecycle = '${lifecycle}'::private.place_lifecycle
    where id = '${placeId}'::uuid
    returning id
  `;
  const output = execFileSync(
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
  );
  if (!output.includes(placeId)) {
    throw new Error('Could not update the local Place lifecycle');
  }
}

function runLocalJsonSql<T>(sql: string): T {
  const output = execFileSync(
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
  );
  const lines = output.trim().split('\n');
  return JSON.parse(lines.at(-1) ?? 'null') as T;
}

function assertUuid(value: string, label: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error(`${label} identifier is invalid`);
  }
}

export async function waitForLocalMagicLink(email: string): Promise<string> {
  const { inbucketUrl } = getLocalSupabaseStatus();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const response = await fetch(`${inbucketUrl}/api/v1/messages`);

    if (response.ok) {
      const mailbox = (await response.json()) as {
        messages: Array<{ ID: string; To: Array<{ Address: string }> }>;
      };
      const latest = mailbox.messages.find((message) =>
        message.To.some((recipient) => recipient.Address === email)
      );

      if (latest) {
        const messageResponse = await fetch(`${inbucketUrl}/api/v1/message/${latest.ID}`);
        const message = await messageResponse.json();
        const link = findVerificationLink(message);

        if (link) {
          return link;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Local magic link email did not arrive');
}

export async function expireLocalMagicLink(email: string): Promise<void> {
  const status = getLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find((candidate) => candidate.email === email);

  if (error || !user || !/^[0-9a-f-]{36}$/i.test(user.id)) {
    throw new Error('Could not identify the local magic-link user');
  }

  const sql = `
    update auth.one_time_tokens
    set
      created_at = now() - interval '2 hours',
      updated_at = now() - interval '2 hours'
    where user_id = '${user.id}'::uuid
    returning id;

    update auth.users
    set
      confirmation_sent_at = case
        when confirmation_sent_at is null then null
        else now() - interval '2 hours'
      end,
      recovery_sent_at = case
        when recovery_sent_at is null then null
        else now() - interval '2 hours'
      end,
      email_change_sent_at = case
        when email_change_sent_at is null then null
        else now() - interval '2 hours'
      end
    where id = '${user.id}'::uuid
    returning id
  `;
  const output = execFileSync(
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
  );

  if (output.trim().split('\n').length < 2) {
    throw new Error('Could not expire the local magic link');
  }
}

function findVerificationLink(value: unknown): string | null {
  const message = value as { HTML?: string; Text?: string };
  const serialized = `${message.HTML ?? ''}\n${message.Text ?? ''}`
    .replace(/=\r?\n/g, '')
    .replaceAll('\\/', '/')
    .replaceAll('\\u0026', '&')
    .replaceAll('&amp;', '&');
  const match = serialized.match(/https?:\/\/[^"\s<>]+\/auth\/v1\/verify[^"\s<>]+/);

  return match?.[0] ?? null;
}

// Dedicated personal-history personal-history fixture Places, fully separate from the shared
// evaluationFixtureIds.places.published fixture other specs reuse, so favouriting/checking in
// against them and later inactivating the predecessor never disturbs state other suites depend
// on. favouriteOnly and mixed are Published with a verified Access Condition so a signed-in
// Member can save/check in through the real UI; predecessor/successor exercise the
// Inactive-with-successor personal-history edge case through a real 'new_operator' identity
// transition sharing one Location.
export const localPersonalHistoryFixtures = {
  favouriteOnly: {
    placeId: 'a1000000-0000-4000-8000-000000000001',
    operatorId: 'a2000000-0000-4000-8000-000000000001',
    locationId: 'a3000000-0000-4000-8000-000000000001',
    accessConditionId: 'a4000000-0000-4000-8000-000000000001',
    verificationId: 'a5000000-0000-4000-8000-000000000001',
    evidenceId: 'a6000000-0000-4000-8000-000000000001',
    nameEn: 'History Favourite Cafe',
    nameIs: 'Einkasögu vistaða kaffihúsið'
  },
  mixed: {
    placeId: 'a1000000-0000-4000-8000-000000000002',
    operatorId: 'a2000000-0000-4000-8000-000000000002',
    locationId: 'a3000000-0000-4000-8000-000000000002',
    accessConditionId: 'a4000000-0000-4000-8000-000000000002',
    verificationId: 'a5000000-0000-4000-8000-000000000002',
    evidenceId: 'a6000000-0000-4000-8000-000000000002',
    nameEn: 'History Mixed Park',
    nameIs: 'Einkasögu heimsótti garðurinn'
  },
  predecessor: {
    placeId: 'a1000000-0000-4000-8000-000000000003',
    operatorId: 'a2000000-0000-4000-8000-000000000003',
    locationId: 'a3000000-0000-4000-8000-000000000003',
    accessConditionId: 'a4000000-0000-4000-8000-000000000003',
    verificationId: 'a5000000-0000-4000-8000-000000000003',
    evidenceId: 'a6000000-0000-4000-8000-000000000003',
    nameEn: 'History Predecessor Shop',
    nameIs: 'Einkasögu fyrri búðin'
  },
  successor: {
    placeId: 'a1000000-0000-4000-8000-000000000004',
    operatorId: 'a2000000-0000-4000-8000-000000000004',
    // Shares the predecessor's Location: the 'new_operator' transition kind requires it.
    locationId: 'a3000000-0000-4000-8000-000000000003',
    nameEn: 'History Successor Shop',
    nameIs: 'Einkasögu nýja búðin'
  }
} as const;

export function provisionLocalPersonalHistoryFixtures(): void {
  const { favouriteOnly, mixed, predecessor, successor } = localPersonalHistoryFixtures;
  const sql = `
    insert into private.operators (id, name) values
      ('${favouriteOnly.operatorId}'::uuid, '${favouriteOnly.nameEn} operator'),
      ('${mixed.operatorId}'::uuid, '${mixed.nameEn} operator'),
      ('${predecessor.operatorId}'::uuid, '${predecessor.nameEn} operator'),
      ('${successor.operatorId}'::uuid, '${successor.nameEn} operator')
    on conflict (id) do nothing;

    insert into private.locations (
      id, address_line, locality, postal_code, municipality, latitude, longitude,
      geometry_precision, geometry_source
    ) values
      ('${favouriteOnly.locationId}'::uuid, 'Sögugata 101', 'Reykjavík', '101', 'reykjavik', 64.144, -21.930, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate'),
      ('${mixed.locationId}'::uuid, 'Sögugata 102', 'Reykjavík', '101', 'reykjavik', 64.145, -21.931, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate'),
      ('${predecessor.locationId}'::uuid, 'Sögugata 103', 'Reykjavík', '101', 'reykjavik', 64.146, -21.932, 'moderator_confirmed_point', 'Reviewed E2E fixture coordinate')
    on conflict (id) do nothing;

    insert into private.places (
      id, operator_id, location_id, purpose, lifecycle, category, version, published_at
    ) values
      ('${favouriteOnly.placeId}'::uuid, '${favouriteOnly.operatorId}'::uuid, '${favouriteOnly.locationId}'::uuid, 'dog_access_destination', 'published', 'cafe', 1, '2026-01-01T00:00:00Z'),
      ('${mixed.placeId}'::uuid, '${mixed.operatorId}'::uuid, '${mixed.locationId}'::uuid, 'dog_access_destination', 'published', 'park', 1, '2026-01-01T00:00:00Z'),
      ('${predecessor.placeId}'::uuid, '${predecessor.operatorId}'::uuid, '${predecessor.locationId}'::uuid, 'dog_access_destination', 'published', 'shop', 1, '2026-01-01T00:00:00Z'),
      ('${successor.placeId}'::uuid, '${successor.operatorId}'::uuid, '${successor.locationId}'::uuid, 'dog_access_destination', 'candidate', 'shop', 1, null)
    on conflict (id) do update set
      lifecycle = excluded.lifecycle,
      published_at = excluded.published_at,
      version = excluded.version;

    insert into private.place_translations (place_id, locale, name, description) values
      ('${favouriteOnly.placeId}'::uuid, 'is', '${favouriteOnly.nameIs}', 'Lýsing.'),
      ('${favouriteOnly.placeId}'::uuid, 'en', '${favouriteOnly.nameEn}', 'Description.'),
      ('${mixed.placeId}'::uuid, 'is', '${mixed.nameIs}', 'Lýsing.'),
      ('${mixed.placeId}'::uuid, 'en', '${mixed.nameEn}', 'Description.'),
      ('${predecessor.placeId}'::uuid, 'is', '${predecessor.nameIs}', 'Lýsing.'),
      ('${predecessor.placeId}'::uuid, 'en', '${predecessor.nameEn}', 'Description.'),
      ('${successor.placeId}'::uuid, 'is', '${successor.nameIs}', 'Lýsing.'),
      ('${successor.placeId}'::uuid, 'en', '${successor.nameEn}', 'Description.')
    on conflict (place_id, locale) do update set name = excluded.name;

    insert into private.access_conditions (id, place_id, access_area, restraint_condition, permission_requirement)
    values
      ('${favouriteOnly.accessConditionId}'::uuid, '${favouriteOnly.placeId}'::uuid, 'outdoors', 'leash_required', 'standing_permission'),
      ('${mixed.accessConditionId}'::uuid, '${mixed.placeId}'::uuid, 'outdoors', 'off_leash_permitted', 'standing_permission'),
      ('${predecessor.accessConditionId}'::uuid, '${predecessor.placeId}'::uuid, 'indoors', 'carrier_required', 'ask_on_arrival')
    on conflict (id) do nothing;

    insert into private.evidence (id, place_id, kind, source_url, source_label, observed_at, recorded_by)
    values
      ('${favouriteOnly.evidenceId}'::uuid, '${favouriteOnly.placeId}'::uuid, 'official_website', 'https://example.invalid/history-fixture-1', 'Fixture source', '2026-01-01T00:00:00Z', null),
      ('${mixed.evidenceId}'::uuid, '${mixed.placeId}'::uuid, 'official_website', 'https://example.invalid/history-fixture-2', 'Fixture source', '2026-01-01T00:00:00Z', null),
      ('${predecessor.evidenceId}'::uuid, '${predecessor.placeId}'::uuid, 'official_website', 'https://example.invalid/history-fixture-3', 'Fixture source', '2026-01-01T00:00:00Z', null)
    on conflict (id) do nothing;

    insert into private.verifications (id, access_condition_id, status, verified_at, freshness_until)
    values
      ('${favouriteOnly.verificationId}'::uuid, '${favouriteOnly.accessConditionId}'::uuid, 'verified', '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z'),
      ('${mixed.verificationId}'::uuid, '${mixed.accessConditionId}'::uuid, 'verified', '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z'),
      ('${predecessor.verificationId}'::uuid, '${predecessor.accessConditionId}'::uuid, 'verified', '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z')
    on conflict (id) do nothing;

    insert into private.verification_evidence (verification_id, evidence_id) values
      ('${favouriteOnly.verificationId}'::uuid, '${favouriteOnly.evidenceId}'::uuid),
      ('${mixed.verificationId}'::uuid, '${mixed.evidenceId}'::uuid),
      ('${predecessor.verificationId}'::uuid, '${predecessor.evidenceId}'::uuid)
    on conflict do nothing;
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'inherit' }
  );
}

// The database contract test exercises the audited quarantine command itself. This E2E-only
// state toggle isolates the member-facing boundary so a test can prove that an existing Favourite
// and Check-in remain usable while the Place coordinates are withheld, then restore the shared
// fixture even if the browser assertion fails.
export function setLocalPersonalHistoryGeometryQuarantined(
  placeId: string,
  quarantined: boolean
): void {
  assertUuid(placeId, 'Personal-history geometry Place');
  const precision = quarantined
    ? 'municipality_anchor_pending_geocode'
    : 'moderator_confirmed_point';
  const source = quarantined
    ? 'E2E quarantine pending correction'
    : 'Reviewed E2E fixture coordinate';
  const lifecycle = quarantined ? 'candidate' : 'published';
  const sql = `
    update private.locations as location_record
    set geometry_precision = '${precision}'::private.location_geometry_precision,
      geometry_source = '${source}'
    from private.places as place_record
    where place_record.id = '${placeId}'::uuid
      and location_record.id = place_record.location_id;

    update private.places
    set lifecycle = '${lifecycle}'::private.place_lifecycle,
      published_at = ${quarantined ? 'null' : 'coalesce(published_at, statement_timestamp())'}
    where id = '${placeId}'::uuid
    returning id;
  `;
  const output = execFileSync(
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
  );
  if (!output.includes(placeId)) {
    throw new Error('Could not update the local personal-history geometry state');
  }
}

// Applies a real 'new_operator' identity transition (freshness-and-identity's public.transition_place_identity)
// retiring the predecessor fixture in favour of the successor fixture, sharing one Location, so
// the personal-history "Inactive with a resolved successor" surface is exercised against a real
// transition row instead of a synthetic shortcut.
export async function transitionLocalPersonalHistorySuccessor(
  moderatorEmail: string
): Promise<void> {
  const status = getLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const moderator = data?.users.find((candidate) => candidate.email === moderatorEmail);

  if (error || !moderator || !/^[0-9a-f-]{36}$/i.test(moderator.id)) {
    throw new Error('Could not identify the local personal-history Moderator fixture');
  }

  const { predecessor, successor } = localPersonalHistoryFixtures;
  const sql = `
    select set_config('request.jwt.claim.sub', '${moderator.id}', true);
    select * from public.transition_place_identity(
      jsonb_build_object(
        'place_id', '${predecessor.placeId}',
        'expected_version', 1,
        'kind', 'new_operator',
        'successor_place_id', '${successor.placeId}',
        'decided_at', clock_timestamp(),
        'decision_notes', 'E2E personal-history successor fixture'
      ),
      extensions.gen_random_uuid()
    );
  `;
  const output = execFileSync(
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
  );
  if (!output.includes(predecessor.placeId)) {
    throw new Error('Could not apply the local personal-history successor transition');
  }
}

// A successor is a Candidate at transition time (transition_place_identity requires it), so the
// personal-history successor note initially renders without a link. Publishing the successor with
// a verified Access Condition chain afterwards makes it discoverable, which the spec asserts
// upgrades the note to a real discovery deep link.
export function publishLocalPersonalHistorySuccessor(): void {
  const { successor } = localPersonalHistoryFixtures;
  const sql = `
    update private.places
    set lifecycle = 'published', published_at = now()
    where id = '${successor.placeId}'::uuid;

    insert into private.access_conditions (id, place_id, access_area, restraint_condition, permission_requirement)
    values ('a4000000-0000-4000-8000-000000000004'::uuid, '${successor.placeId}'::uuid, 'indoors', 'leash_required', 'standing_permission')
    on conflict (id) do nothing;

    insert into private.evidence (id, place_id, kind, source_url, source_label, observed_at, recorded_by)
    values ('a6000000-0000-4000-8000-000000000004'::uuid, '${successor.placeId}'::uuid, 'official_website', 'https://example.invalid/history-fixture-4', 'Fixture source', now(), null)
    on conflict (id) do nothing;

    insert into private.verifications (id, access_condition_id, status, verified_at, freshness_until)
    values ('a5000000-0000-4000-8000-000000000004'::uuid, 'a4000000-0000-4000-8000-000000000004'::uuid, 'verified', now(), '2099-01-01T00:00:00Z')
    on conflict (id) do nothing;

    insert into private.verification_evidence (verification_id, evidence_id)
    values ('a5000000-0000-4000-8000-000000000004'::uuid, 'a6000000-0000-4000-8000-000000000004'::uuid)
    on conflict do nothing;
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'ignore' }
  );
}

// Restores every personal-history fixture Place to Candidate (removing it from public discovery) and
// clears any transition/Favourite/Check-in residue, so later specs sharing this local database
// session never see these fixtures in the public directory or a stale identity transition.
export function retireLocalPersonalHistoryFixtures(): void {
  const { favouriteOnly, mixed, predecessor, successor } = localPersonalHistoryFixtures;
  const placeIds = [favouriteOnly.placeId, mixed.placeId, predecessor.placeId, successor.placeId];
  const placeIdList = placeIds.map((id) => `'${id}'::uuid`).join(', ');
  const sql = `
    delete from private.member_favourites where place_id in (${placeIdList});
    delete from private.check_ins where place_id in (${placeIdList});
    delete from private.place_identity_transitions
      where predecessor_place_id in (${placeIdList}) or successor_place_id in (${placeIdList});
    update private.places
    set lifecycle = 'candidate', published_at = null, version = 1
    where id in (${placeIdList});
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'inherit' }
  );
}

// Inserts `count` distinct historical Check-ins for the named Member/Place pair, spread one per
// day so every row falls outside record_check_in's rolling 24-hour duplicate window. Used to
// prove keyset pagination deterministically without waiting real time or clicking "Check in"
// dozens of times through the UI.
export async function insertLocalCheckInBacklog(
  memberEmail: string,
  placeId: string,
  count: number
): Promise<void> {
  assertUuid(placeId, 'Check-in backlog Place');
  const status = getLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const member = data?.users.find((candidate) => candidate.email === memberEmail);

  if (error || !member || !/^[0-9a-f-]{36}$/i.test(member.id)) {
    throw new Error('Could not identify the local Check-in backlog Member fixture');
  }

  const values = Array.from(
    { length: count },
    (_, index) =>
      `('${member.id}'::uuid, '${placeId}'::uuid, 'unknown', extensions.gen_random_uuid(), now() - interval '${index + 1} days')`
  ).join(',\n      ');
  const sql = `
    insert into private.check_ins (member_id, place_id, proximity_confirmed, request_id, checked_in_at)
    values
      ${values};
  `;
  execFileSync(
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
      sql
    ],
    { stdio: 'ignore' }
  );
}
