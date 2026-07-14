begin;

create function public.list_published_places(requested_locale text)
returns table (
  place_id uuid,
  name text,
  category text,
  locality text,
  latitude double precision,
  longitude double precision,
  access_area text,
  restraint_condition text,
  permission_requirement text,
  verified_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (place_record.id)
    place_record.id as place_id,
    translation.name,
    place_record.category::text,
    location_record.locality,
    location_record.latitude,
    location_record.longitude,
    access_condition.access_area::text,
    access_condition.restraint_condition::text,
    access_condition.permission_requirement::text,
    verification.verified_at
  from private.places as place_record
  join private.place_translations as translation
    on translation.place_id = place_record.id
   and translation.locale = case
     when requested_locale = 'en' then 'en'::private.locale_code
     else 'is'::private.locale_code
   end
  join private.locations as location_record
    on location_record.id = place_record.location_id
  join private.access_conditions as access_condition
    on access_condition.place_id = place_record.id
   and access_condition.superseded_at is null
  join private.verifications as verification
    on verification.access_condition_id = access_condition.id
   and verification.status = 'verified'::private.verification_status
   and verification.superseded_at is null
   and verification.freshness_until > statement_timestamp()
  where place_record.lifecycle = 'published'::private.place_lifecycle
    and exists (
      select 1
      from private.verification_evidence as evidence_link
      where evidence_link.verification_id = verification.id
    )
  order by place_record.id, verification.verified_at desc, access_condition.id;
$$;

create function public.get_published_place_profile(
  requested_place_id uuid,
  requested_locale text
)
returns table (
  place_id uuid,
  name text,
  description text,
  category text,
  address_line text,
  locality text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  website_url text,
  phone text,
  opening_hours jsonb,
  access_condition_id uuid,
  access_area text,
  restraint_condition text,
  dog_eligibility jsonb,
  availability_window jsonb,
  permission_requirement text,
  evidence_kinds text[],
  verified_at timestamptz,
  freshness_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    place_record.id as place_id,
    translation.name,
    translation.description,
    place_record.category::text,
    location_record.address_line,
    location_record.locality,
    location_record.postal_code,
    location_record.latitude,
    location_record.longitude,
    place_record.website_url,
    place_record.phone,
    place_record.opening_hours,
    access_condition.id as access_condition_id,
    access_condition.access_area::text,
    access_condition.restraint_condition::text,
    access_condition.dog_eligibility,
    access_condition.availability_window,
    access_condition.permission_requirement::text,
    array(
      select distinct evidence_record.kind::text
      from private.verification_evidence as evidence_link
      join private.evidence as evidence_record
        on evidence_record.id = evidence_link.evidence_id
      where evidence_link.verification_id = verification.id
      order by evidence_record.kind::text
    ) as evidence_kinds,
    verification.verified_at,
    verification.freshness_until
  from private.places as place_record
  join private.place_translations as translation
    on translation.place_id = place_record.id
   and translation.locale = case
     when requested_locale = 'en' then 'en'::private.locale_code
     else 'is'::private.locale_code
   end
  join private.locations as location_record
    on location_record.id = place_record.location_id
  join private.access_conditions as access_condition
    on access_condition.place_id = place_record.id
   and access_condition.superseded_at is null
  join private.verifications as verification
    on verification.access_condition_id = access_condition.id
   and verification.status = 'verified'::private.verification_status
   and verification.superseded_at is null
   and verification.freshness_until > statement_timestamp()
  where place_record.id = requested_place_id
    and place_record.lifecycle = 'published'::private.place_lifecycle
    and exists (
      select 1
      from private.verification_evidence as evidence_link
      where evidence_link.verification_id = verification.id
    )
  order by access_condition.id;
$$;

revoke execute on function public.list_published_places(text)
  from public, service_role;
revoke execute on function public.get_published_place_profile(uuid, text)
  from public, service_role;

grant execute on function public.list_published_places(text)
  to anon, authenticated;
grant execute on function public.get_published_place_profile(uuid, text)
  to anon, authenticated;

comment on function public.list_published_places(text) is
  'Fixed public map and list projection for Published Places with current Evidence-backed Verification.';

comment on function public.get_published_place_profile(uuid, text) is
  'Fixed public profile projection. Private, Candidate, unverified, stale, and disputed Places return no rows.';

commit;
