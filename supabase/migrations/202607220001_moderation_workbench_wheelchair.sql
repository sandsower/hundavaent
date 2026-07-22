drop function public.get_moderation_place_review_v2(uuid);

create function public.get_moderation_place_review_v2(requested_place_id uuid)
returns table (
  place_id uuid,
  version bigint,
  lifecycle text,
  candidate_status text,
  item_version bigint,
  draft_version bigint,
  draft_payload jsonb,
  draft_updated_by uuid,
  draft_updated_at timestamptz,
  readiness_state text,
  readiness_issues jsonb,
  originating_suggestion_id uuid,
  contributor_id uuid,
  wheelchair_accessibility text,
  operator_name text,
  category text,
  website_url text,
  phone text,
  opening_hours jsonb,
  dog_amenities jsonb,
  address_line text,
  locality text,
  postal_code text,
  municipality text,
  latitude double precision,
  longitude double precision,
  geometry_precision text,
  geometry_source text,
  name_is text,
  description_is text,
  name_en text,
  description_en text,
  access_conditions jsonb,
  evidence_records jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_moderator();

  return query
  select
    review.place_id,
    review.version,
    review.lifecycle,
    review.candidate_status,
    review.item_version,
    review.draft_version,
    review.draft_payload,
    review.draft_updated_by,
    review.draft_updated_at,
    review.readiness_state,
    review.readiness_issues,
    review.originating_suggestion_id,
    review.contributor_id,
    place_record.wheelchair_accessibility::text,
    review.operator_name,
    review.category,
    review.website_url,
    review.phone,
    review.opening_hours,
    review.dog_amenities,
    review.address_line,
    review.locality,
    review.postal_code,
    review.municipality,
    review.latitude,
    review.longitude,
    review.geometry_precision,
    review.geometry_source,
    review.name_is,
    review.description_is,
    review.name_en,
    review.description_en,
    review.access_conditions,
    review.evidence_records
  from public.get_moderation_place_review(requested_place_id) as review
  join private.places as place_record on place_record.id = review.place_id;
end;
$$;

revoke execute on function public.get_moderation_place_review_v2(uuid)
  from public, anon, service_role;
grant execute on function public.get_moderation_place_review_v2(uuid) to authenticated;

comment on function public.get_moderation_place_review_v2(uuid) is
  'Complete draft-aware moderation review projection with wheelchair accessibility.';
