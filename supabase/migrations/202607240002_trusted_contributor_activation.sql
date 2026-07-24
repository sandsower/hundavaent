begin;

-- Keep the service-controlled policy boundary, but represent the approved rolling window in exact
-- calendar months. The original seconds parameter could only approximate "twelve months".
create function private.reconcile_trusted_contributor_achievement(
  as_of timestamptz default now()
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  definition_version integer;
  inserted_count integer;
begin
  select max(definition.version)
  into definition_version
  from private.achievement_definitions as definition
  where definition.key = 'sustained_quality_contributor';

  if definition_version is null then
    raise exception using
      errcode = '55000',
      message = 'The sustained-quality Achievement definition is unavailable';
  end if;

  insert into private.achievement_unlocks (
    member_id,
    achievement_key,
    definition_version,
    earned_at
  )
  select
    member_account.user_id,
    'sustained_quality_contributor',
    definition_version,
    as_of
  from private.member_accounts as member_account
  cross join lateral private.compute_contributor_status(member_account.user_id) as status
  where status.status = 'trusted_contributor'
  on conflict (member_id, achievement_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke execute on function private.reconcile_trusted_contributor_achievement(timestamptz)
  from public, anon, authenticated, service_role;

comment on function private.reconcile_trusted_contributor_achievement(timestamptz) is
  'Idempotently grants only the permanent sustained-quality recognition to Members who hold live Trusted Contributor status, independent of the separate future-only Achievement eligibility boundary.';

drop function public.configure_contributor_status_policy(
  text, integer, integer, integer, integer, integer, boolean
);

create function public.configure_contributor_status_policy(
  requested_policy_version text,
  requested_trusted_minimum_net_accepted integer,
  requested_trusted_window_months integer,
  requested_trusted_minimum_distinct_months integer,
  requested_trusted_minimum_distinct_subjects integer,
  requested_trusted_maximum_revoked_in_window integer,
  requested_enabled boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(requested_policy_version), '') is null
    or requested_trusted_minimum_net_accepted <= 0
    or requested_trusted_window_months <= 0
    or requested_trusted_minimum_distinct_months <= 0
    or requested_trusted_minimum_distinct_subjects <= 0
    or requested_trusted_maximum_revoked_in_window < 0
  then
    raise exception using errcode = '22023', message = 'Contributor status policy is invalid';
  end if;

  insert into private.contributor_status_policy (
    singleton,
    policy_version,
    trusted_minimum_net_accepted,
    trusted_window,
    trusted_minimum_distinct_months,
    trusted_minimum_distinct_subjects,
    trusted_maximum_revoked_in_window,
    enabled,
    updated_at
  ) values (
    true,
    btrim(requested_policy_version),
    requested_trusted_minimum_net_accepted,
    make_interval(months => requested_trusted_window_months),
    requested_trusted_minimum_distinct_months,
    requested_trusted_minimum_distinct_subjects,
    requested_trusted_maximum_revoked_in_window,
    requested_enabled,
    statement_timestamp()
  )
  on conflict (singleton) do update set
    policy_version = excluded.policy_version,
    trusted_minimum_net_accepted = excluded.trusted_minimum_net_accepted,
    trusted_window = excluded.trusted_window,
    trusted_minimum_distinct_months = excluded.trusted_minimum_distinct_months,
    trusted_minimum_distinct_subjects = excluded.trusted_minimum_distinct_subjects,
    trusted_maximum_revoked_in_window = excluded.trusted_maximum_revoked_in_window,
    enabled = excluded.enabled,
    updated_at = excluded.updated_at;

  -- Policy activation is the moment existing qualifying Members first reach the live status.
  -- Reconcile only the permanent sustained-quality recognition. This deliberately bypasses the
  -- separate future-only Achievement eligibility boundary without unlocking unrelated history.
  if requested_enabled then
    perform private.reconcile_trusted_contributor_achievement(statement_timestamp());
  end if;
end;
$$;

revoke execute on function public.configure_contributor_status_policy(
  text, integer, integer, integer, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.configure_contributor_status_policy(
  text, integer, integer, integer, integer, integer, boolean
) to service_role;

comment on function public.configure_contributor_status_policy(
  text, integer, integer, integer, integer, integer, boolean
) is
  'Service-role-only versioned configuration boundary. The rolling trust window is expressed in exact calendar months, activation reconciles immutable Achievement unlocks for existing qualifying Members, and a missing or disabled policy keeps Trusted Contributor unreachable.';

-- Make Trusted priority part of the database cursor order instead of reordering one fetched page in
-- application memory. The calendar-day bucket bounds the advantage while the full tuple keeps every
-- page deterministic. Queue status rank remains the strongest signal.
drop function public.list_moderation_place_suggestions(
  text, integer, timestamptz, uuid, integer
);

create function public.list_moderation_place_suggestions(
  requested_filter text,
  cursor_queue_rank integer default null,
  cursor_trust_priority integer default null,
  cursor_submitted_at timestamptz default null,
  cursor_suggestion_id uuid default null,
  requested_limit integer default 20
)
returns table (
  suggestion_id uuid,
  member_id uuid,
  status text,
  operator_name text,
  name_is text,
  name_en text,
  category text,
  address_line text,
  locality text,
  submitted_at timestamptz,
  updated_at timestamptz,
  queue_rank integer,
  trust_tier text,
  trust_priority integer,
  item_version bigint,
  draft_version bigint,
  draft_updated_by uuid,
  draft_updated_at timestamptz,
  readiness_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page_size integer := least(greatest(coalesce(requested_limit, 20), 1), 51);
begin
  perform security.require_moderator();

  if requested_filter not in ('actionable', 'deferred', 'resolved') then
    raise exception using errcode = '22023', message = 'Moderation queue filter is invalid';
  end if;

  if (
    cursor_queue_rank is null
    or cursor_trust_priority is null
    or cursor_submitted_at is null
    or cursor_suggestion_id is null
  ) and not (
    cursor_queue_rank is null
    and cursor_trust_priority is null
    and cursor_submitted_at is null
    and cursor_suggestion_id is null
  ) then
    raise exception using errcode = '22023', message = 'Suggestion queue cursor is invalid';
  end if;

  return query
  with queue as (
    select
      suggestion.id as suggestion_id,
      suggestion.member_id,
      suggestion.status::text as status,
      coalesce(draft.payload, suggestion.proposal) ->> 'operator_name' as operator_name,
      coalesce(draft.payload, suggestion.proposal) #>> '{translations,is,name}' as name_is,
      coalesce(draft.payload, suggestion.proposal) #>> '{translations,en,name}' as name_en,
      coalesce(draft.payload, suggestion.proposal) ->> 'category' as category,
      coalesce(draft.payload, suggestion.proposal) #>> '{location,address_line}' as address_line,
      coalesce(draft.payload, suggestion.proposal) #>> '{location,locality}' as locality,
      suggestion.submitted_at,
      suggestion.updated_at,
      case
        when suggestion.status = 'submitted' then 0
        when suggestion.status = 'needs_information' then 1
        else 2
      end as queue_rank,
      contributor.status as trust_tier,
      case contributor.status
        when 'trusted_contributor' then 0
        when 'contributor' then 1
        else 2
      end as trust_priority,
      suggestion.version as item_version,
      coalesce(draft.current_version, 0) as draft_version,
      draft.updated_by as draft_updated_by,
      draft.updated_at as draft_updated_at,
      case
        when jsonb_typeof(coalesce(draft.payload, suggestion.proposal)) = 'object' then 'ready'
        else 'blocked'
      end as readiness_state
    from private.place_suggestions as suggestion
    left join private.moderation_drafts as draft on draft.suggestion_id = suggestion.id
    cross join lateral private.compute_contributor_status(suggestion.member_id) as contributor
    where
      (requested_filter = 'actionable' and suggestion.status = 'submitted')
      or (requested_filter = 'deferred' and suggestion.status = 'needs_information')
      or (
        requested_filter = 'resolved'
        and suggestion.status in ('accepted', 'duplicate', 'rejected')
      )
  )
  select
    queue.suggestion_id,
    queue.member_id,
    queue.status,
    queue.operator_name,
    queue.name_is,
    queue.name_en,
    queue.category,
    queue.address_line,
    queue.locality,
    queue.submitted_at,
    queue.updated_at,
    queue.queue_rank,
    queue.trust_tier,
    queue.trust_priority,
    queue.item_version,
    queue.draft_version,
    queue.draft_updated_by,
    queue.draft_updated_at,
    queue.readiness_state
  from queue
  where cursor_queue_rank is null
    or (
      queue.queue_rank,
      queue.submitted_at::date,
      queue.trust_priority,
      queue.submitted_at,
      queue.suggestion_id
    ) > (
      cursor_queue_rank,
      cursor_submitted_at::date,
      cursor_trust_priority,
      cursor_submitted_at,
      cursor_suggestion_id
    )
  order by
    queue.queue_rank,
    queue.submitted_at::date,
    queue.trust_priority,
    queue.submitted_at,
    queue.suggestion_id
  limit page_size;
end;
$$;

revoke execute on function public.list_moderation_place_suggestions(
  text, integer, integer, timestamptz, uuid, integer
) from public, anon, service_role;
grant execute on function public.list_moderation_place_suggestions(
  text, integer, integer, timestamptz, uuid, integer
) to authenticated;

comment on function public.list_moderation_place_suggestions(
  text, integer, integer, timestamptz, uuid, integer
) is
  'Moderator-only Suggestion queue with live Trusted Contributor priority bounded within one queue rank and calendar day. Priority changes ordering only and never changes review requirements.';

-- Corrections and Reports use the same trust signal. Safety and workflow status retain precedence,
-- then trust reorders only within one calendar day.
drop function public.list_moderation_place_flags(
  text, integer, timestamptz, uuid, integer
);

create function public.list_moderation_place_flags(
  requested_filter text,
  cursor_priority integer default null,
  cursor_trust_priority integer default null,
  cursor_submitted_at timestamptz default null,
  cursor_flag_id uuid default null,
  requested_limit integer default 20
)
returns table (
  flag_id uuid,
  member_id uuid,
  kind text,
  status text,
  place_id uuid,
  place_name_is text,
  place_name_en text,
  target_kind text,
  target_field text,
  access_condition_id uuid,
  report_reason text,
  is_safety_concern boolean,
  submitted_at timestamptz,
  updated_at timestamptz,
  priority integer,
  trust_tier text,
  trust_priority integer,
  item_version bigint,
  draft_version bigint,
  draft_updated_by uuid,
  draft_updated_at timestamptz,
  readiness_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page_size integer := least(greatest(coalesce(requested_limit, 20), 1), 51);
begin
  perform security.require_moderator();

  if requested_filter not in ('actionable', 'deferred', 'resolved') then
    raise exception using errcode = '22023', message = 'Moderation queue filter is invalid';
  end if;

  if (
    cursor_priority is null
    or cursor_trust_priority is null
    or cursor_submitted_at is null
    or cursor_flag_id is null
  ) and not (
    cursor_priority is null
    and cursor_trust_priority is null
    and cursor_submitted_at is null
    and cursor_flag_id is null
  ) then
    raise exception using errcode = '22023', message = 'Correction and Report queue cursor is invalid';
  end if;

  return query
  with queue as (
    select
      flag.id as flag_id,
      flag.member_id,
      flag.kind::text as kind,
      flag.status::text as status,
      flag.place_id,
      translations.name_is as place_name_is,
      translations.name_en as place_name_en,
      flag.target_kind::text as target_kind,
      flag.target_field::text as target_field,
      flag.access_condition_id,
      flag.report_reason::text as report_reason,
      flag.is_safety_concern,
      flag.submitted_at,
      flag.updated_at,
      case
        when flag.is_safety_concern and flag.status = 'submitted' then 0
        when flag.status = 'submitted' then 1
        when flag.status = 'needs_information' then 2
        else 3
      end as priority,
      contributor.status as trust_tier,
      case contributor.status
        when 'trusted_contributor' then 0
        when 'contributor' then 1
        else 2
      end as trust_priority,
      flag.version as item_version,
      coalesce(draft.current_version, 0) as draft_version,
      draft.updated_by as draft_updated_by,
      draft.updated_at as draft_updated_at,
      case
        when flag.kind = 'report' or draft.current_version is not null then 'ready'
        else 'needs_attention'
      end as readiness_state
    from private.place_flags as flag
    cross join lateral (
      select
        max(translation.name) filter (where translation.locale = 'is') as name_is,
        max(translation.name) filter (where translation.locale = 'en') as name_en
      from private.place_translations as translation
      where translation.place_id = flag.place_id
    ) as translations
    left join private.moderation_drafts as draft on draft.flag_id = flag.id
    cross join lateral private.compute_contributor_status(flag.member_id) as contributor
    where
      (requested_filter = 'actionable' and flag.status = 'submitted')
      or (requested_filter = 'deferred' and flag.status = 'needs_information')
      or (
        requested_filter = 'resolved'
        and flag.status in (
          'applied',
          'confirmed_useful',
          'dispute_opened',
          'place_inactivated',
          'rejected'
        )
      )
  )
  select
    queue.flag_id,
    queue.member_id,
    queue.kind,
    queue.status,
    queue.place_id,
    queue.place_name_is,
    queue.place_name_en,
    queue.target_kind,
    queue.target_field,
    queue.access_condition_id,
    queue.report_reason,
    queue.is_safety_concern,
    queue.submitted_at,
    queue.updated_at,
    queue.priority,
    queue.trust_tier,
    queue.trust_priority,
    queue.item_version,
    queue.draft_version,
    queue.draft_updated_by,
    queue.draft_updated_at,
    queue.readiness_state
  from queue
  where cursor_priority is null
    or (
      queue.priority,
      queue.submitted_at::date,
      queue.trust_priority,
      queue.submitted_at,
      queue.flag_id
    ) > (
      cursor_priority,
      cursor_submitted_at::date,
      cursor_trust_priority,
      cursor_submitted_at,
      cursor_flag_id
    )
  order by
    queue.priority,
    queue.submitted_at::date,
    queue.trust_priority,
    queue.submitted_at,
    queue.flag_id
  limit page_size;
end;
$$;

revoke execute on function public.list_moderation_place_flags(
  text, integer, integer, timestamptz, uuid, integer
) from public, anon, service_role;
grant execute on function public.list_moderation_place_flags(
  text, integer, integer, timestamptz, uuid, integer
) to authenticated;

comment on function public.list_moderation_place_flags(
  text, integer, integer, timestamptz, uuid, integer
) is
  'Moderator-only Correction and Report queue. Safety and workflow status keep precedence; live Trusted Contributor status only advances review order within the same calendar day.';

-- The current privilege remains live and revocable. This immutable Achievement is the permanent
-- recognition and one-time unread celebration, with copy that makes that distinction explicit.
insert into private.achievement_definitions (
  key,
  version,
  achievement_group,
  display_order,
  name_is,
  name_en,
  description_is,
  description_en,
  criteria,
  locked_visibility,
  progress_kind
) values (
  'sustained_quality_contributor',
  2,
  'contribution_quality',
  8,
  'Viðurkennd fyrir gæði',
  'Recognized for Quality',
  'Þú vannst þetta afrek með viðvarandi, staðfestum gæðum. Núverandi staða trausts framlagsgjafa getur breyst; meðan hún er virk færir hún erindi þín fyrr í yfirferð en tryggir aldrei samþykki.',
  'You earned this Achievement through sustained, confirmed quality. Current Trusted Contributor status can change; while active it brings your submissions forward for review but never guarantees acceptance.',
  '{}'::jsonb,
  'surprise',
  null
)
on conflict (key, version) do nothing;

commit;
