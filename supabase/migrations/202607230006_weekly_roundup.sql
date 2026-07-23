begin;

create function private.is_canonical_roundup_municipalities(values_to_check text[])
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select values_to_check is not null
    and cardinality(values_to_check) between 1 and 7
    and array_position(values_to_check, null) is null
    and (
      select bool_and(private.is_capital_region_municipality(value))
      from unnest(values_to_check) as municipality(value)
    )
    and (
      select array_agg(value order by value) = values_to_check
      from (
        select distinct value
        from unnest(values_to_check) as municipality(value)
      ) as canonical
    );
$$;

create function private.is_canonical_roundup_categories(
  values_to_check private.place_category[]
)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select values_to_check is not null
    and cardinality(values_to_check) <= 11
    and array_position(values_to_check, null) is null
    and (
      select array_agg(value order by value::text) = values_to_check
      from (
        select distinct value
        from unnest(values_to_check) as category(value)
      ) as canonical
    );
$$;

create table private.member_roundup_preferences (
  member_id uuid primary key references private.member_accounts(user_id) on delete restrict,
  municipalities text[] not null,
  categories private.place_category[] not null default array[]::private.place_category[],
  roundup_locale private.locale_code not null,
  email_interest boolean not null default false,
  email_interest_changed_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint member_roundup_preferences_municipalities_check
    check (private.is_canonical_roundup_municipalities(municipalities)),
  constraint member_roundup_preferences_categories_check
    check (private.is_canonical_roundup_categories(categories)),
  constraint member_roundup_preferences_time_check
    check (
      updated_at >= created_at
      and email_interest_changed_at >= created_at
      and email_interest_changed_at <= updated_at
    )
);

alter table private.member_roundup_preferences enable row level security;

create index locations_municipality_idx
  on private.locations (municipality, id);

create index places_roundup_published_at_idx
  on private.places (published_at desc, id)
  where lifecycle = 'published'::private.place_lifecycle;

create index places_roundup_updated_at_idx
  on private.places (updated_at desc, id)
  where lifecycle = 'published'::private.place_lifecycle;

create function public.get_current_member_roundup_preferences()
returns table (
  configured boolean,
  municipalities text[],
  categories text[],
  roundup_locale text,
  email_interest boolean,
  email_interest_changed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
begin
  return query
  select
    true,
    preference.municipalities,
    array(
      select category::text
      from unnest(preference.categories) as selected(category)
      order by category::text
    ),
    preference.roundup_locale::text,
    preference.email_interest,
    preference.email_interest_changed_at,
    preference.updated_at
  from private.member_roundup_preferences as preference
  where preference.member_id = actor_id;

  if not found then
    return query
    select
      false,
      array[]::text[],
      array[]::text[],
      'is'::text,
      false,
      null::timestamptz,
      null::timestamptz;
  end if;
end;
$$;

create function public.save_current_member_roundup_preferences(
  requested_municipalities text[],
  requested_categories text[],
  requested_locale text,
  requested_email_interest boolean
)
returns table (
  configured boolean,
  municipalities text[],
  categories text[],
  roundup_locale text,
  email_interest boolean,
  email_interest_changed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  command_time timestamptz := statement_timestamp();
  canonical_municipalities text[];
  canonical_categories private.place_category[];
  normalized_locale private.locale_code;
begin
  if requested_municipalities is null
    or cardinality(requested_municipalities) not between 1 and 7
    or array_position(requested_municipalities, null) is not null
    or (
      select not bool_and(private.is_capital_region_municipality(value))
      from unnest(requested_municipalities) as municipality(value)
    )
  then
    raise exception using
      errcode = '22023',
      message = 'One or more supported municipalities are required';
  end if;

  select array_agg(distinct value order by value)
  into canonical_municipalities
  from unnest(requested_municipalities) as municipality(value);

  if cardinality(canonical_municipalities) <> cardinality(requested_municipalities) then
    raise exception using
      errcode = '22023',
      message = 'Municipalities must be unique';
  end if;

  if requested_categories is null
    or cardinality(requested_categories) > 11
    or array_position(requested_categories, null) is not null
    or exists (
      select 1
      from unnest(requested_categories) as requested(value)
      where not exists (
        select 1
        from unnest(enum_range(null::private.place_category)) as allowed(value)
        where allowed.value::text = requested.value
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Place categories are invalid';
  end if;

  select coalesce(
    array_agg(distinct value::private.place_category order by value::private.place_category),
    array[]::private.place_category[]
  )
  into canonical_categories
  from unnest(requested_categories) as category(value);

  if cardinality(canonical_categories) <> cardinality(requested_categories) then
    raise exception using
      errcode = '22023',
      message = 'Place categories must be unique';
  end if;

  if requested_locale not in ('is', 'en') then
    raise exception using
      errcode = '22023',
      message = 'Roundup language is invalid';
  end if;

  if requested_email_interest is null then
    raise exception using
      errcode = '22023',
      message = 'Email interest must be explicit';
  end if;

  normalized_locale := requested_locale::private.locale_code;

  insert into private.member_roundup_preferences (
    member_id,
    municipalities,
    categories,
    roundup_locale,
    email_interest,
    email_interest_changed_at,
    created_at,
    updated_at
  )
  values (
    actor_id,
    canonical_municipalities,
    canonical_categories,
    normalized_locale,
    requested_email_interest,
    command_time,
    command_time,
    command_time
  )
  on conflict (member_id)
  do update set
    municipalities = excluded.municipalities,
    categories = excluded.categories,
    roundup_locale = excluded.roundup_locale,
    email_interest = excluded.email_interest,
    email_interest_changed_at = case
      when member_roundup_preferences.email_interest
        is distinct from excluded.email_interest
      then command_time
      else member_roundup_preferences.email_interest_changed_at
    end,
    updated_at = command_time;

  return query
  select *
  from public.get_current_member_roundup_preferences();
end;
$$;

create function public.get_current_member_weekly_roundup()
returns table (
  configured boolean,
  week_starts_on date,
  week_ends_on date,
  roundup_locale text,
  place_id uuid,
  place_name text,
  category text,
  municipality text,
  recommendation_reason text,
  changed_at timestamptz,
  recommendation_rank integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  preference private.member_roundup_preferences%rowtype;
  preference_configured boolean;
  current_week record;
  previous_starts_on date;
  previous_ends_on date;
  previous_starts_at timestamptz;
  previous_ends_at timestamptz;
begin
  select *
  into preference
  from private.member_roundup_preferences as saved_preference
  where saved_preference.member_id = actor_id;

  preference_configured := found;

  select *
  into current_week
  from private.reykjavik_week_bounds(statement_timestamp());

  previous_starts_on := current_week.starts_on - 7;
  previous_ends_on := current_week.starts_on - 1;
  previous_starts_at := current_week.starts_at - interval '7 days';
  previous_ends_at := current_week.starts_at;

  if not preference_configured then
    return query
    select
      false,
      previous_starts_on,
      previous_ends_on,
      'is'::text,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      null::integer;
    return;
  end if;

  return query
  with candidates as (
    select
      place_record.id as candidate_place_id,
      coalesce(requested_translation.name, english_translation.name) as candidate_name,
      place_record.category::text as candidate_category,
      location_record.municipality as candidate_municipality,
      case
        when place_record.published_at >= previous_starts_at
          and place_record.published_at < previous_ends_at
        then 'newly_published'
        else 'updated'
      end as candidate_reason,
      case
        when place_record.published_at >= previous_starts_at
          and place_record.published_at < previous_ends_at
        then place_record.published_at
        else greatest(
          place_record.updated_at,
          location_record.updated_at,
          coalesce(requested_translation.updated_at, '-infinity'::timestamptz),
          coalesce(english_translation.updated_at, '-infinity'::timestamptz)
        )
      end as candidate_changed_at
    from private.places as place_record
    join private.locations as location_record
      on location_record.id = place_record.location_id
    left join private.place_translations as requested_translation
      on requested_translation.place_id = place_record.id
     and requested_translation.locale = preference.roundup_locale
    left join private.place_translations as english_translation
      on english_translation.place_id = place_record.id
     and english_translation.locale = 'en'::private.locale_code
    where place_record.lifecycle = 'published'::private.place_lifecycle
      and location_record.municipality = any(preference.municipalities)
      and (
        cardinality(preference.categories) = 0
        or place_record.category = any(preference.categories)
      )
      and coalesce(requested_translation.name, english_translation.name) is not null
      and private.has_publishable_geometry(place_record.id)
      and exists (
        select 1
        from private.access_conditions as access_condition
        join private.verifications as verification
          on verification.access_condition_id = access_condition.id
         and verification.status = 'verified'::private.verification_status
         and verification.superseded_at is null
        where access_condition.place_id = place_record.id
          and access_condition.superseded_at is null
      )
      and (
        (
          place_record.published_at >= previous_starts_at
          and place_record.published_at < previous_ends_at
        )
        or (
          place_record.published_at < previous_starts_at
          and greatest(
            place_record.updated_at,
            location_record.updated_at,
            coalesce(requested_translation.updated_at, '-infinity'::timestamptz),
            coalesce(english_translation.updated_at, '-infinity'::timestamptz)
          ) >= previous_starts_at
          and greatest(
            place_record.updated_at,
            location_record.updated_at,
            coalesce(requested_translation.updated_at, '-infinity'::timestamptz),
            coalesce(english_translation.updated_at, '-infinity'::timestamptz)
          ) < previous_ends_at
        )
      )
  ),
  ranked as (
    select
      candidates.*,
      row_number() over (
        order by
          case candidates.candidate_reason when 'newly_published' then 0 else 1 end,
          candidates.candidate_changed_at desc,
          candidates.candidate_name,
          candidates.candidate_place_id
      )::integer as candidate_rank
    from candidates
  ),
  selected as (
    select *
    from ranked
    where ranked.candidate_rank <= 6
  )
  select
    result.configured,
    result.week_starts_on,
    result.week_ends_on,
    result.roundup_locale,
    result.place_id,
    result.place_name,
    result.category,
    result.municipality,
    result.recommendation_reason,
    result.changed_at,
    result.recommendation_rank
  from (
    select
      true as configured,
      previous_starts_on as week_starts_on,
      previous_ends_on as week_ends_on,
      preference.roundup_locale::text as roundup_locale,
      selected.candidate_place_id as place_id,
      selected.candidate_name as place_name,
      selected.candidate_category as category,
      selected.candidate_municipality as municipality,
      selected.candidate_reason as recommendation_reason,
      selected.candidate_changed_at as changed_at,
      selected.candidate_rank as recommendation_rank
    from selected

    union all

    select
      true,
      previous_starts_on,
      previous_ends_on,
      preference.roundup_locale::text,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      null::integer
    where not exists (select 1 from selected)
  ) as result
  order by result.recommendation_rank nulls last;
end;
$$;

create function private.detach_member_roundup_preferences(requested_member_id uuid)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  removed_count bigint;
begin
  delete from private.member_roundup_preferences as preference
  where preference.member_id = requested_member_id;

  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

revoke all on private.member_roundup_preferences
  from public, anon, authenticated, service_role;
revoke execute on function private.is_canonical_roundup_municipalities(text[])
  from public, anon, authenticated, service_role;
revoke execute on function private.is_canonical_roundup_categories(private.place_category[])
  from public, anon, authenticated, service_role;
revoke execute on function private.detach_member_roundup_preferences(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.get_current_member_roundup_preferences()
  from public, anon, service_role;
revoke execute on function public.save_current_member_roundup_preferences(
  text[],
  text[],
  text,
  boolean
) from public, anon, service_role;
revoke execute on function public.get_current_member_weekly_roundup()
  from public, anon, service_role;

grant execute on function public.get_current_member_roundup_preferences()
  to authenticated;
grant execute on function public.save_current_member_roundup_preferences(
  text[],
  text[],
  text,
  boolean
) to authenticated;
grant execute on function public.get_current_member_weekly_roundup()
  to authenticated;

comment on table private.member_roundup_preferences is
  'Explicit private Member selections for the in-product weekly roundup without inferred location or activity history.';
comment on function public.get_current_member_roundup_preferences() is
  'Returns only the authenticated Member explicit roundup selections.';
comment on function public.save_current_member_roundup_preferences(text[], text[], text, boolean) is
  'Validates and saves the authenticated Member explicit roundup selections without sending email.';
comment on function public.get_current_member_weekly_roundup() is
  'Returns up to six public-eligible Places from the previous completed Reykjavík week using only explicit selections.';
comment on function private.detach_member_roundup_preferences(uuid) is
  'Deletes one Member private roundup preference during account deletion.';

commit;
