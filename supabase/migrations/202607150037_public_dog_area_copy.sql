begin;

-- These seven launch records were imported with moderator/provenance prose in fields that the
-- public projection treats as visitor copy. Keep the private Evidence rows intact while replacing
-- the public text with concise, stable visitor guidance.
update private.access_conditions as condition
set access_area_note = replacement.note,
    restraint_note = 'Dogs must remain under handler supervision.'
from (values
  ('ddc771f5-4c55-41c2-8fe2-36336fc3761d'::uuid,
    'Fenced dog park in Breiðholt.'::text),
  ('a35580cf-7e90-420f-8c9c-ac7a8772a56e'::uuid,
    'Fenced dog park by Berjarimi in Grafarvogur.'::text),
  ('6f489572-c0dc-4b1f-8826-8f386f1763f3'::uuid,
    'Open undeveloped area.'::text),
  ('10686843-cf2c-4211-a2de-293ed221de08'::uuid,
    'Open undeveloped area on Geldinganes.'::text),
  ('f312a9af-6084-4a4c-9f15-fe367c414fad'::uuid,
    'Fenced dog park by Hringbraut.'::text),
  ('161a43eb-c73b-4965-a1c3-bf9c460a7053'::uuid,
    'Fenced dog park in Laugardalur.'::text),
  ('3f41f44e-871f-4407-ac65-1a5dd0d9fb28'::uuid,
    'The area excludes designated walking, riding and driving routes, and private property.'::text)
) as replacement(condition_id, note)
where condition.id = replacement.condition_id;

update private.place_translations as translation
set description = case translation.locale
  when 'is'::private.locale_code
    then 'Opinbert hundasvæði á vegum Reykjavíkurborg í Reykjavík.'
  else 'Official dog area operated by Reykjavíkurborg in Reykjavík.'
end
where translation.place_id in (
  select condition.place_id
  from private.access_conditions as condition
  where condition.id in (
    'ddc771f5-4c55-41c2-8fe2-36336fc3761d'::uuid,
    'a35580cf-7e90-420f-8c9c-ac7a8772a56e'::uuid,
    '6f489572-c0dc-4b1f-8826-8f386f1763f3'::uuid,
    '10686843-cf2c-4211-a2de-293ed221de08'::uuid,
    'f312a9af-6084-4a4c-9f15-fe367c414fad'::uuid,
    '161a43eb-c73b-4965-a1c3-bf9c460a7053'::uuid,
    '3f41f44e-871f-4407-ac65-1a5dd0d9fb28'::uuid
  )
);

create or replace function public.get_published_place_profile_v2(
  requested_place_id uuid,
  requested_locale text
)
returns table (
  place_id uuid, name text, description text, category text, address_line text, locality text,
  postal_code text, latitude double precision, longitude double precision, website_url text,
  phone text, opening_hours jsonb, dog_amenities jsonb, access_condition_id uuid,
  access_area text, access_area_note text, restraint_condition text, restraint_note text,
  dog_eligibility jsonb, availability_state text, availability_window jsonb,
  permission_requirement text, access_information_urls jsonb
)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(t_requested.name, t_english.name),
    coalesce(t_requested.description, t_english.description), p.category::text,
    l.address_line, l.locality, l.postal_code, l.latitude, l.longitude, p.website_url,
    p.phone, p.opening_hours, p.dog_amenities, c.id, c.access_area::text,
    c.access_area_note, c.restraint_condition::text, c.restraint_note, c.dog_eligibility,
    c.availability_state::text, c.availability_window, c.permission_requirement::text,
    '[]'::jsonb
  from private.places p
  left join private.place_translations t_requested on t_requested.place_id = p.id
    and t_requested.locale = case when requested_locale = 'is'
      then 'is'::private.locale_code else 'en'::private.locale_code end
  left join private.place_translations t_english on t_english.place_id = p.id
    and t_english.locale = 'en'::private.locale_code
  join private.locations l on l.id = p.location_id
  join private.access_conditions c on c.place_id = p.id and c.superseded_at is null
  join private.verifications v on v.access_condition_id = c.id and v.status = 'verified'
    and v.superseded_at is null
  where p.id = requested_place_id and p.lifecycle = 'published'
    and private.has_publishable_geometry(p.id)
    and coalesce(t_requested.name, t_english.name) is not null
    and coalesce(t_requested.description, t_english.description) is not null
    and exists (
      select 1 from private.verification_evidence ve where ve.verification_id = v.id
    )
  order by c.created_at, c.id;
$$;

comment on function public.get_published_place_profile_v2(uuid, text) is
  'Published place details with visitor guidance and without internal evidence, source URLs, or freshness state.';

commit;
