begin;

create type private.freshness_task_status as enum ('due', 'completed');
create type private.dispute_status as enum ('open', 'resolved');
create type private.dispute_evidence_stance as enum ('supporting', 'contradicting', 'resolution');
create type private.dispute_resolution as enum ('dismissed', 'confirmed');
create type private.place_identity_transition_kind as enum (
  'rebrand',
  'inactive',
  'move',
  'new_operator',
  'material_purpose_change'
);

alter table private.verifications
  add column command_request_id uuid;

create unique index verifications_condition_command_unique
  on private.verifications (access_condition_id, command_request_id)
  where command_request_id is not null;

create table private.freshness_tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  place_id uuid not null references private.places(id) on delete restrict,
  access_condition_id uuid not null references private.access_conditions(id) on delete restrict,
  verification_id uuid not null unique references private.verifications(id) on delete restrict,
  due_at timestamptz not null,
  status private.freshness_task_status not null default 'due',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null,
  completed_by uuid references auth.users(id) on delete restrict,
  completed_at timestamptz,
  completion_verification_id uuid references private.verifications(id) on delete restrict,
  constraint freshness_task_completion_check check (
    (status = 'due' and completed_by is null and completed_at is null and completion_verification_id is null)
    or
    (status = 'completed' and completed_by is not null and completed_at is not null and completion_verification_id is not null)
  )
);

create index freshness_tasks_due_idx
  on private.freshness_tasks (due_at, id)
  where status = 'due';

create table private.access_disputes (
  id uuid primary key default extensions.gen_random_uuid(),
  place_id uuid not null references private.places(id) on delete restrict,
  access_condition_id uuid not null references private.access_conditions(id) on delete restrict,
  displaced_verification_id uuid not null references private.verifications(id) on delete restrict,
  disputed_verification_id uuid not null unique references private.verifications(id) on delete restrict,
  status private.dispute_status not null default 'open',
  opened_by uuid not null references auth.users(id) on delete restrict,
  opened_at timestamptz not null,
  open_request_id uuid not null unique,
  opened_reason text not null check (btrim(opened_reason) <> ''),
  resolution private.dispute_resolution,
  resolution_notes text,
  resolved_by uuid references auth.users(id) on delete restrict,
  resolved_at timestamptz,
  resolve_request_id uuid unique,
  resolution_verification_id uuid references private.verifications(id) on delete restrict,
  constraint access_dispute_resolution_check check (
    (status = 'open' and resolution is null and resolution_notes is null and resolved_by is null
      and resolved_at is null and resolve_request_id is null and resolution_verification_id is null)
    or
    (status = 'resolved' and resolution is not null and nullif(btrim(resolution_notes), '') is not null
      and resolved_by is not null and resolved_at is not null and resolve_request_id is not null
      and resolution_verification_id is not null)
  )
);

create unique index access_disputes_one_open_per_condition
  on private.access_disputes (access_condition_id)
  where status = 'open';

create table private.access_dispute_evidence (
  dispute_id uuid not null references private.access_disputes(id) on delete restrict,
  evidence_id uuid not null references private.evidence(id) on delete restrict,
  stance private.dispute_evidence_stance not null,
  primary key (dispute_id, evidence_id, stance)
);

create table private.place_identity_transitions (
  id uuid primary key default extensions.gen_random_uuid(),
  predecessor_place_id uuid not null references private.places(id) on delete restrict,
  successor_place_id uuid references private.places(id) on delete restrict,
  kind private.place_identity_transition_kind not null,
  predecessor_version bigint not null check (predecessor_version > 0),
  request_id uuid not null unique,
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null,
  decision_notes text not null check (btrim(decision_notes) <> ''),
  previous_identity jsonb not null default '{}'::jsonb check (jsonb_typeof(previous_identity) = 'object'),
  resulting_identity jsonb not null default '{}'::jsonb check (jsonb_typeof(resulting_identity) = 'object'),
  constraint place_identity_successor_check check (
    (kind in ('rebrand', 'inactive') and successor_place_id is null)
    or
    (kind in ('move', 'new_operator', 'material_purpose_change')
      and successor_place_id is not null and successor_place_id <> predecessor_place_id)
  )
);

create unique index place_identity_one_predecessor_per_successor
  on private.place_identity_transitions (successor_place_id)
  where successor_place_id is not null;

alter table private.freshness_tasks enable row level security;
alter table private.access_disputes enable row level security;
alter table private.access_dispute_evidence enable row level security;
alter table private.place_identity_transitions enable row level security;

create function private.record_lifecycle_evidence(
  requested_place_id uuid,
  evidence_payload jsonb,
  actor_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_evidence_id uuid;
begin
  if evidence_payload is null
    or jsonb_typeof(evidence_payload) <> 'object'
    or not private.jsonb_has_only_keys(
      evidence_payload,
      array['kind', 'source_url', 'source_citation', 'source_label', 'observed_at', 'source_metadata']
    )
    or nullif(btrim(evidence_payload ->> 'source_label'), '') is null
    or (nullif(btrim(evidence_payload ->> 'source_url'), '') is null
      and nullif(btrim(evidence_payload ->> 'source_citation'), '') is null)
  then
    raise exception using errcode = '22023', message = 'Lifecycle Evidence is incomplete';
  end if;

  insert into private.evidence (
    place_id, kind, source_url, source_citation, source_label, observed_at, recorded_by,
    source_metadata
  ) values (
    requested_place_id,
    (evidence_payload ->> 'kind')::private.evidence_kind,
    nullif(btrim(evidence_payload ->> 'source_url'), ''),
    nullif(btrim(evidence_payload ->> 'source_citation'), ''),
    btrim(evidence_payload ->> 'source_label'),
    (evidence_payload ->> 'observed_at')::timestamptz,
    actor_id,
    coalesce(evidence_payload -> 'source_metadata', '{}'::jsonb)
  ) returning id into created_evidence_id;

  return created_evidence_id;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Lifecycle Evidence is invalid';
end;
$$;

create function private.effective_freshness_boundary(requested_verification_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select least(
    verification_record.freshness_until,
    verification_record.verified_at +
      case
        when place_record.category in ('park'::private.place_category, 'recreation'::private.place_category)
          and condition_record.access_area = 'outdoors'::private.access_area
          and exists (
            select 1
            from private.verification_evidence evidence_link
            join private.evidence evidence_record on evidence_record.id = evidence_link.evidence_id
            where evidence_link.verification_id = verification_record.id
              and evidence_record.kind in (
                'official_website'::private.evidence_kind,
                'public_record'::private.evidence_kind
              )
          )
        then interval '1 year'
        else interval '6 months'
      end
  )
  from private.verifications verification_record
  join private.access_conditions condition_record
    on condition_record.id = verification_record.access_condition_id
  join private.places place_record on place_record.id = condition_record.place_id
  where verification_record.id = requested_verification_id;
$$;

create function public.schedule_reconfirmation_due(
  requested_as_of timestamptz,
  command_request_id uuid
)
returns table (task_id uuid, verification_id uuid, due_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
begin
  if requested_as_of is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Scheduler clock and request ID are required';
  end if;

  -- Lifecycle lock order is global and deterministic: owning Places by ID first,
  -- then their current Access Conditions by ID, then current Verifications by ID.
  return query
  with candidate_places as materialized (
    select distinct condition_record.place_id
    from private.verifications verification_record
    join private.access_conditions condition_record
      on condition_record.id = verification_record.access_condition_id
      and condition_record.superseded_at is null
    join private.places place_record on place_record.id = condition_record.place_id
    where verification_record.status = 'verified'
      and verification_record.superseded_at is null
      and place_record.lifecycle = 'published'
      and private.effective_freshness_boundary(verification_record.id) <= requested_as_of
  ),
  locked_places as materialized (
    select place_record.id
    from private.places place_record
    join candidate_places candidate on candidate.place_id = place_record.id
    where place_record.lifecycle = 'published'
    order by place_record.id
    for update of place_record
  ),
  locked_conditions as materialized (
    select condition_record.id, condition_record.place_id
    from private.access_conditions condition_record
    join locked_places place_record on place_record.id = condition_record.place_id
    where condition_record.superseded_at is null
    order by condition_record.place_id, condition_record.id
    for update of condition_record
  ),
  eligible_verifications as materialized (
    select
      condition_record.place_id,
      condition_record.id as access_condition_id,
      verification_record.id as verification_id,
      private.effective_freshness_boundary(verification_record.id) as due_at
    from private.verifications verification_record
    join locked_conditions condition_record
      on condition_record.id = verification_record.access_condition_id
    where verification_record.status = 'verified'
      and verification_record.superseded_at is null
      and private.effective_freshness_boundary(verification_record.id) <= requested_as_of
    order by condition_record.place_id, condition_record.id, verification_record.id
    for update of verification_record
  )
  insert into private.freshness_tasks (
    place_id, access_condition_id, verification_id, due_at, created_by, created_at
  )
  select eligible.place_id, eligible.access_condition_id, eligible.verification_id,
    eligible.due_at, actor_id, requested_as_of
  from eligible_verifications eligible
  on conflict on constraint freshness_tasks_verification_id_key do nothing
  returning freshness_tasks.id, freshness_tasks.verification_id, freshness_tasks.due_at;

  perform private.append_audit_event(
    'freshness.scheduled', 'freshness_run', command_request_id, command_request_id,
    jsonb_build_object('as_of', requested_as_of)
  );
end;
$$;

create function public.reconfirm_access_condition(
  command_payload jsonb,
  command_request_id uuid
)
returns table (verification_id uuid, verified_at timestamptz, freshness_until timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  requested_condition_id uuid := (command_payload ->> 'access_condition_id')::uuid;
  expected_verification_id uuid := (command_payload ->> 'expected_verification_id')::uuid;
  requested_verified_at timestamptz := (command_payload ->> 'verified_at')::timestamptz;
  requested_freshness_until timestamptz := (command_payload ->> 'freshness_until')::timestamptz;
  current_verification private.verifications%rowtype;
  owning_place private.places%rowtype;
  locked_condition private.access_conditions%rowtype;
  requested_place_id uuid;
  created_evidence_id uuid;
  created_verification_id uuid;
  existing_verification_id uuid;
  existing_verified_at timestamptz;
  existing_freshness_until timestamptz;
begin
  if command_request_id is null or jsonb_typeof(command_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Reconfirmation command is incomplete';
  end if;

  select condition_record.place_id into requested_place_id
  from private.access_conditions condition_record
  where condition_record.id = requested_condition_id;
  if not found then
    raise exception using errcode = '22023', message = 'Access Condition not found';
  end if;

  -- Every single-Place lifecycle command takes Place, Condition, then Verification locks.
  select place_record.* into owning_place
  from private.places place_record
  where place_record.id = requested_place_id
  for update;

  select verification_record.id, verification_record.verified_at,
      verification_record.freshness_until
    into existing_verification_id, existing_verified_at, existing_freshness_until
  from private.verifications verification_record
  where verification_record.access_condition_id = requested_condition_id
    and verification_record.command_request_id = $2;
  if found then
    return query select existing_verification_id, existing_verified_at, existing_freshness_until;
    return;
  end if;

  if owning_place.lifecycle <> 'published' then
    raise exception using errcode = '40001', message = 'Owning Place is not published';
  end if;

  select condition_record.* into locked_condition
  from private.access_conditions condition_record
  where condition_record.id = requested_condition_id
    and condition_record.place_id = requested_place_id
  for update;
  if not found or locked_condition.superseded_at is not null then
    raise exception using errcode = '40001', message = 'Access Condition state changed';
  end if;

  select verification_record.* into current_verification
  from private.verifications verification_record
  where verification_record.access_condition_id = requested_condition_id
    and verification_record.superseded_at is null
  for update;

  if not found or current_verification.id <> expected_verification_id
    or current_verification.status <> 'verified'
  then
    raise exception using errcode = '40001', message = 'Verification state changed';
  end if;
  if requested_freshness_until <= requested_verified_at then
    raise exception using errcode = '22023', message = 'Freshness boundary must follow Verification';
  end if;

  created_evidence_id := private.record_lifecycle_evidence(
    requested_place_id, command_payload -> 'evidence', actor_id
  );

  update private.verifications
  set superseded_at = requested_verified_at
  where id = current_verification.id;

  insert into private.verifications (
    access_condition_id, status, verified_by, verified_at, freshness_until,
    decision_metadata, command_request_id
  ) values (
    requested_condition_id, 'verified', actor_id, requested_verified_at,
    requested_freshness_until,
    coalesce(command_payload -> 'decision_metadata', '{}'::jsonb), command_request_id
  ) returning id into created_verification_id;

  insert into private.verification_evidence (verification_id, evidence_id)
  select created_verification_id, evidence_link.evidence_id
  from private.verification_evidence evidence_link
  where evidence_link.verification_id = current_verification.id
  union
  select created_verification_id, created_evidence_id;

  update private.freshness_tasks
  set status = 'completed', completed_by = actor_id, completed_at = requested_verified_at,
    completion_verification_id = created_verification_id
  where freshness_tasks.verification_id = current_verification.id
    and freshness_tasks.status = 'due';

  perform private.append_audit_event(
    'access.reconfirmed', 'access_condition', requested_condition_id, command_request_id,
    jsonb_build_object(
      'displaced_verification_id', current_verification.id,
      'verification_id', created_verification_id,
      'evidence_id', created_evidence_id
    )
  );

  return query select created_verification_id, requested_verified_at, requested_freshness_until;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Reconfirmation command is invalid';
end;
$$;

create function public.open_access_dispute(
  command_payload jsonb,
  command_request_id uuid
)
returns table (dispute_id uuid, disputed_verification_id uuid, opened_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  requested_condition_id uuid := (command_payload ->> 'access_condition_id')::uuid;
  expected_verification_id uuid := (command_payload ->> 'expected_verification_id')::uuid;
  requested_opened_at timestamptz := (command_payload ->> 'opened_at')::timestamptz;
  current_verification private.verifications%rowtype;
  owning_place private.places%rowtype;
  locked_condition private.access_conditions%rowtype;
  requested_place_id uuid;
  contradicting_evidence_id uuid;
  created_disputed_verification_id uuid;
  created_dispute_id uuid;
  existing_dispute_id uuid;
  existing_disputed_verification_id uuid;
  existing_opened_at timestamptz;
begin
  if command_request_id is null or jsonb_typeof(command_payload) is distinct from 'object'
    or nullif(btrim(command_payload ->> 'reason'), '') is null
  then
    raise exception using errcode = '22023', message = 'Dispute command is incomplete';
  end if;

  select condition_record.place_id into requested_place_id
  from private.access_conditions condition_record
  where condition_record.id = requested_condition_id;
  if not found then
    raise exception using errcode = '22023', message = 'Access Condition not found';
  end if;

  select place_record.* into owning_place
  from private.places place_record
  where place_record.id = requested_place_id
  for update;

  select dispute_record.id, dispute_record.disputed_verification_id, dispute_record.opened_at
    into existing_dispute_id, existing_disputed_verification_id, existing_opened_at
  from private.access_disputes dispute_record
  where dispute_record.open_request_id = command_request_id;
  if found then
    return query select existing_dispute_id, existing_disputed_verification_id, existing_opened_at;
    return;
  end if;

  if owning_place.lifecycle <> 'published' then
    raise exception using errcode = '40001', message = 'Owning Place is not published';
  end if;

  select condition_record.* into locked_condition
  from private.access_conditions condition_record
  where condition_record.id = requested_condition_id
    and condition_record.place_id = requested_place_id
  for update;
  if not found or locked_condition.superseded_at is not null then
    raise exception using errcode = '40001', message = 'Access Condition state changed';
  end if;

  select verification_record.* into current_verification
  from private.verifications verification_record
  where verification_record.access_condition_id = requested_condition_id
    and verification_record.superseded_at is null
  for update;

  if not found or current_verification.id <> expected_verification_id
    or current_verification.status <> 'verified'
  then
    raise exception using errcode = '40001', message = 'Verification state changed';
  end if;

  contradicting_evidence_id := private.record_lifecycle_evidence(
    requested_place_id, command_payload -> 'evidence', actor_id
  );

  update private.verifications
  set superseded_at = requested_opened_at
  where id = current_verification.id;

  insert into private.verifications (
    access_condition_id, status, verified_by, verified_at, freshness_until,
    decision_metadata, command_request_id
  ) values (
    requested_condition_id, 'disputed', actor_id, requested_opened_at,
    greatest(current_verification.freshness_until, requested_opened_at + interval '1 microsecond'),
    jsonb_build_object('reason', btrim(command_payload ->> 'reason')),
    command_request_id
  ) returning id into created_disputed_verification_id;

  insert into private.access_disputes (
    place_id, access_condition_id, displaced_verification_id, disputed_verification_id,
    opened_by, opened_at, open_request_id, opened_reason
  ) values (
    requested_place_id, requested_condition_id, current_verification.id,
    created_disputed_verification_id, actor_id, requested_opened_at, command_request_id,
    btrim(command_payload ->> 'reason')
  ) returning id into created_dispute_id;

  insert into private.access_dispute_evidence (dispute_id, evidence_id, stance)
  select created_dispute_id, evidence_id, 'supporting'::private.dispute_evidence_stance
  from private.verification_evidence
  where verification_id = current_verification.id;

  insert into private.access_dispute_evidence (dispute_id, evidence_id, stance)
  values (created_dispute_id, contradicting_evidence_id, 'contradicting');

  perform private.append_audit_event(
    'access.disputed', 'access_condition', requested_condition_id, command_request_id,
    jsonb_build_object(
      'dispute_id', created_dispute_id,
      'displaced_verification_id', current_verification.id,
      'disputed_verification_id', created_disputed_verification_id,
      'contradicting_evidence_id', contradicting_evidence_id
    )
  );

  return query select created_dispute_id, created_disputed_verification_id, requested_opened_at;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Dispute command is invalid';
end;
$$;

create function public.resolve_access_dispute(
  command_payload jsonb,
  command_request_id uuid
)
returns table (
  dispute_id uuid,
  access_condition_id uuid,
  verification_id uuid,
  resolved_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  requested_dispute_id uuid := (command_payload ->> 'dispute_id')::uuid;
  requested_outcome private.dispute_resolution := (command_payload ->> 'outcome')::private.dispute_resolution;
  requested_resolved_at timestamptz := (command_payload ->> 'resolved_at')::timestamptz;
  requested_freshness_until timestamptz := (command_payload ->> 'freshness_until')::timestamptz;
  dispute_record private.access_disputes%rowtype;
  old_condition private.access_conditions%rowtype;
  owning_place private.places%rowtype;
  locked_disputed_verification private.verifications%rowtype;
  routed_place_id uuid;
  routed_condition_id uuid;
  routed_disputed_verification_id uuid;
  resulting_condition_id uuid;
  created_evidence_id uuid;
  created_verification_id uuid;
begin
  if command_request_id is null or jsonb_typeof(command_payload) is distinct from 'object'
    or nullif(btrim(command_payload ->> 'resolution_notes'), '') is null
    or requested_freshness_until <= requested_resolved_at
  then
    raise exception using errcode = '22023', message = 'Resolution command is incomplete';
  end if;

  select dispute_value.place_id, dispute_value.access_condition_id,
      dispute_value.disputed_verification_id
    into routed_place_id, routed_condition_id, routed_disputed_verification_id
  from private.access_disputes dispute_value
  where dispute_value.id = requested_dispute_id;
  if not found then
    raise exception using errcode = '22023', message = 'Dispute not found';
  end if;

  select place_record.* into owning_place
  from private.places place_record
  where place_record.id = routed_place_id
  for update;

  select condition_record.* into old_condition
  from private.access_conditions condition_record
  where condition_record.id = routed_condition_id
    and condition_record.place_id = routed_place_id
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'Access Condition state changed';
  end if;

  select verification_record.* into locked_disputed_verification
  from private.verifications verification_record
  where verification_record.id = routed_disputed_verification_id
    and verification_record.access_condition_id = routed_condition_id
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'Disputed Verification state changed';
  end if;

  select dispute_value.* into dispute_record
  from private.access_disputes dispute_value
  where dispute_value.id = requested_dispute_id
  for update;
  if not found
    or dispute_record.place_id <> routed_place_id
    or dispute_record.access_condition_id <> routed_condition_id
    or dispute_record.disputed_verification_id <> routed_disputed_verification_id
  then
    raise exception using errcode = '40001', message = 'Dispute state changed';
  end if;
  if dispute_record.status = 'resolved' then
    if dispute_record.resolve_request_id = command_request_id then
      return query select dispute_record.id,
        (select verification_record.access_condition_id from private.verifications verification_record
          where verification_record.id = dispute_record.resolution_verification_id),
        dispute_record.resolution_verification_id, dispute_record.resolved_at;
      return;
    end if;
    raise exception using errcode = '40001', message = 'Dispute is already resolved';
  end if;

  if owning_place.lifecycle <> 'published' then
    raise exception using errcode = '40001', message = 'Owning Place is not published';
  end if;

  created_evidence_id := private.record_lifecycle_evidence(
    dispute_record.place_id, command_payload -> 'evidence', actor_id
  );

  update private.verifications
  set superseded_at = requested_resolved_at
  where id = dispute_record.disputed_verification_id and superseded_at is null;

  if requested_outcome = 'dismissed' then
    resulting_condition_id := old_condition.id;
  else
    if jsonb_typeof(command_payload -> 'replacement_condition') is distinct from 'object' then
      raise exception using errcode = '22023', message = 'Confirmed dispute requires a replacement condition';
    end if;

    update private.access_conditions
    set superseded_at = requested_resolved_at
    where id = old_condition.id and superseded_at is null;

    insert into private.access_conditions (
      place_id, revision, supersedes_condition_id, access_area, access_area_note,
      restraint_condition, restraint_note, dog_eligibility, availability_window,
      permission_requirement, created_by, created_at
    ) values (
      old_condition.place_id, old_condition.revision + 1, old_condition.id,
      (command_payload #>> '{replacement_condition,access_area}')::private.access_area,
      nullif(btrim(command_payload #>> '{replacement_condition,access_area_note}'), ''),
      (command_payload #>> '{replacement_condition,restraint_condition}')::private.restraint_condition,
      nullif(btrim(command_payload #>> '{replacement_condition,restraint_note}'), ''),
      coalesce(command_payload #> '{replacement_condition,dog_eligibility}', '{"scope":"all_dogs"}'::jsonb),
      coalesce(command_payload #> '{replacement_condition,availability_window}', '{}'::jsonb),
      (command_payload #>> '{replacement_condition,permission_requirement}')::private.permission_requirement,
      actor_id, requested_resolved_at
    ) returning id into resulting_condition_id;
  end if;

  insert into private.verifications (
    access_condition_id, status, verified_by, verified_at, freshness_until,
    decision_metadata, command_request_id
  ) values (
    resulting_condition_id, 'verified', actor_id, requested_resolved_at,
    requested_freshness_until,
    jsonb_build_object(
      'dispute_id', dispute_record.id,
      'outcome', requested_outcome,
      'resolution_notes', btrim(command_payload ->> 'resolution_notes')
    ), command_request_id
  ) returning id into created_verification_id;

  insert into private.verification_evidence (verification_id, evidence_id)
  select created_verification_id, evidence_link.evidence_id
  from private.verification_evidence evidence_link
  where requested_outcome = 'dismissed'
    and evidence_link.verification_id = dispute_record.displaced_verification_id
  union
  select created_verification_id, created_evidence_id;

  insert into private.access_dispute_evidence (dispute_id, evidence_id, stance)
  values (dispute_record.id, created_evidence_id, 'resolution');

  update private.access_disputes
  set status = 'resolved', resolution = requested_outcome,
    resolution_notes = btrim(command_payload ->> 'resolution_notes'), resolved_by = actor_id,
    resolved_at = requested_resolved_at, resolve_request_id = command_request_id,
    resolution_verification_id = created_verification_id
  where id = dispute_record.id;

  perform private.append_audit_event(
    'access.dispute_resolved', 'access_condition', dispute_record.access_condition_id,
    command_request_id,
    jsonb_build_object(
      'dispute_id', dispute_record.id,
      'outcome', requested_outcome,
      'resulting_condition_id', resulting_condition_id,
      'verification_id', created_verification_id,
      'resolution_evidence_id', created_evidence_id
    )
  );

  return query select dispute_record.id, resulting_condition_id,
    created_verification_id, requested_resolved_at;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Resolution command is invalid';
end;
$$;

create function public.transition_place_identity(
  command_payload jsonb,
  command_request_id uuid
)
returns table (
  transition_id uuid,
  predecessor_place_id uuid,
  successor_place_id uuid,
  transition_kind text,
  predecessor_version bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  requested_place_id uuid := (command_payload ->> 'place_id')::uuid;
  expected_version bigint := (command_payload ->> 'expected_version')::bigint;
  requested_kind private.place_identity_transition_kind :=
    (command_payload ->> 'kind')::private.place_identity_transition_kind;
  requested_successor_id uuid := nullif(command_payload ->> 'successor_place_id', '')::uuid;
  requested_decided_at timestamptz := (command_payload ->> 'decided_at')::timestamptz;
  predecessor private.places%rowtype;
  successor private.places%rowtype;
  previous_names jsonb;
  resulting_names jsonb;
  created_transition_id uuid;
  existing_transition_id uuid;
  existing_predecessor_id uuid;
  existing_successor_id uuid;
  existing_kind private.place_identity_transition_kind;
  existing_predecessor_version bigint;
begin
  if command_request_id is null or jsonb_typeof(command_payload) is distinct from 'object'
    or nullif(btrim(command_payload ->> 'decision_notes'), '') is null
  then
    raise exception using errcode = '22023', message = 'Identity transition command is incomplete';
  end if;

  select place_record.* into predecessor
  from private.places place_record
  where place_record.id = requested_place_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Predecessor Place not found';
  end if;

  select transition_record.id, transition_record.predecessor_place_id,
      transition_record.successor_place_id, transition_record.kind,
      transition_record.predecessor_version
    into existing_transition_id, existing_predecessor_id, existing_successor_id,
      existing_kind, existing_predecessor_version
  from private.place_identity_transitions transition_record
  where transition_record.request_id = command_request_id;
  if found then
    return query select existing_transition_id, existing_predecessor_id, existing_successor_id,
      existing_kind::text, existing_predecessor_version;
    return;
  end if;

  if predecessor.version <> expected_version or predecessor.lifecycle <> 'published' then
    raise exception using errcode = '40001', message = 'Predecessor Place state changed';
  end if;

  select coalesce(jsonb_object_agg(translation_record.locale::text, translation_record.name), '{}'::jsonb)
    into previous_names
  from private.place_translations translation_record
  where translation_record.place_id = predecessor.id;

  if requested_kind = 'rebrand' then
    if nullif(btrim(command_payload #>> '{names,is}'), '') is null
      or nullif(btrim(command_payload #>> '{names,en}'), '') is null
      or requested_successor_id is not null
    then
      raise exception using errcode = '22023', message = 'Rebrand requires both names and no successor';
    end if;
    update private.place_translations
    set name = case locale
      when 'is'::private.locale_code then btrim(command_payload #>> '{names,is}')
      else btrim(command_payload #>> '{names,en}') end,
      updated_at = requested_decided_at
    where place_id = predecessor.id;
    update private.places
    set version = version + 1, updated_at = requested_decided_at
    where id = predecessor.id;
  elsif requested_kind = 'inactive' then
    if requested_successor_id is not null then
      raise exception using errcode = '22023', message = 'Inactivity cannot identify a successor';
    end if;
    update private.places
    set lifecycle = 'inactive', version = version + 1, updated_at = requested_decided_at
    where id = predecessor.id;
  else
    select place_record.* into successor
    from private.places place_record
    where place_record.id = requested_successor_id
    for update;
    if not found or successor.id = predecessor.id or successor.lifecycle <> 'candidate' then
      raise exception using errcode = '22023', message = 'Distinct successor Place is required';
    end if;

    if exists (
      select 1
      from private.place_identity_transitions transition_record
      where transition_record.successor_place_id = successor.id
    ) then
      raise exception using errcode = '40001', message = 'Successor Place is already linked';
    end if;

    if requested_kind = 'move'
      and (successor.location_id = predecessor.location_id
        or successor.operator_id <> predecessor.operator_id
        or lower(successor.purpose) <> lower(predecessor.purpose))
    then
      raise exception using errcode = '22023', message = 'Move requires continuity at a new Location';
    elsif requested_kind = 'new_operator'
      and (successor.location_id <> predecessor.location_id
        or successor.operator_id = predecessor.operator_id)
    then
      raise exception using errcode = '22023', message = 'Operator transition requires a new Operator at the same Location';
    elsif requested_kind = 'material_purpose_change'
      and (successor.location_id <> predecessor.location_id
        or lower(successor.purpose) = lower(predecessor.purpose))
    then
      raise exception using errcode = '22023', message = 'Purpose transition requires a new purpose at the same Location';
    end if;

    update private.places
    set lifecycle = 'inactive', version = version + 1, updated_at = requested_decided_at
    where id = predecessor.id;
  end if;

  select coalesce(jsonb_object_agg(translation_record.locale::text, translation_record.name), '{}'::jsonb)
    into resulting_names
  from private.place_translations translation_record
  where translation_record.place_id = coalesce(requested_successor_id, predecessor.id);

  insert into private.place_identity_transitions (
    predecessor_place_id, successor_place_id, kind, predecessor_version, request_id,
    decided_by, decided_at, decision_notes, previous_identity, resulting_identity
  ) values (
    predecessor.id, requested_successor_id, requested_kind, predecessor.version + 1,
    command_request_id, actor_id, requested_decided_at,
    btrim(command_payload ->> 'decision_notes'),
    jsonb_build_object(
      'operator_id', predecessor.operator_id,
      'location_id', predecessor.location_id,
      'purpose', predecessor.purpose,
      'names', previous_names
    ),
    jsonb_build_object(
      'place_id', coalesce(requested_successor_id, predecessor.id),
      'operator_id', coalesce(successor.operator_id, predecessor.operator_id),
      'location_id', coalesce(successor.location_id, predecessor.location_id),
      'purpose', coalesce(successor.purpose, predecessor.purpose),
      'names', resulting_names
    )
  ) returning id into created_transition_id;

  perform private.append_audit_event(
    'place.identity_transitioned', 'place', predecessor.id, command_request_id,
    jsonb_build_object(
      'transition_id', created_transition_id,
      'kind', requested_kind,
      'successor_place_id', requested_successor_id,
      'version', predecessor.version + 1
    )
  );

  return query select created_transition_id, predecessor.id, requested_successor_id,
    requested_kind::text, predecessor.version + 1;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Identity transition command is invalid';
end;
$$;

create function public.get_public_place_status(requested_place_id uuid, requested_locale text)
returns table (place_id uuid, name text, public_status text)
language sql
stable
security definer
set search_path = ''
as $$
  select place_record.id, translation_record.name,
    case
      when place_record.lifecycle = 'inactive' then 'inactive'
      else 'access_under_review'
    end
  from private.places place_record
  join private.place_translations translation_record
    on translation_record.place_id = place_record.id
    and translation_record.locale = case
      when requested_locale = 'en' then 'en'::private.locale_code
      else 'is'::private.locale_code
    end
  where place_record.id = requested_place_id
    and place_record.lifecycle in ('published'::private.place_lifecycle, 'inactive'::private.place_lifecycle)
    and (
      place_record.lifecycle = 'inactive'
      or not exists (
        select 1
        from private.access_conditions condition_record
        join private.verifications verification_record
          on verification_record.access_condition_id = condition_record.id
          and verification_record.status = 'verified'
          and verification_record.superseded_at is null
        where condition_record.place_id = place_record.id
          and condition_record.superseded_at is null
          and exists (
            select 1 from private.verification_evidence evidence_link
            where evidence_link.verification_id = verification_record.id
          )
      )
    );
$$;

revoke execute on function private.record_lifecycle_evidence(uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.effective_freshness_boundary(uuid)
  from public, anon, authenticated, service_role;

revoke execute on function public.schedule_reconfirmation_due(timestamptz, uuid)
  from public, anon, service_role;
revoke execute on function public.reconfirm_access_condition(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.open_access_dispute(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.resolve_access_dispute(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.transition_place_identity(jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.schedule_reconfirmation_due(timestamptz, uuid) to authenticated;
grant execute on function public.reconfirm_access_condition(jsonb, uuid) to authenticated;
grant execute on function public.open_access_dispute(jsonb, uuid) to authenticated;
grant execute on function public.resolve_access_dispute(jsonb, uuid) to authenticated;
grant execute on function public.transition_place_identity(jsonb, uuid) to authenticated;

revoke execute on function public.get_public_place_status(uuid, text) from public, service_role;
grant execute on function public.get_public_place_status(uuid, text) to anon, authenticated;

commit;
