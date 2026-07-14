-- Launch-inventory ingestion tooling support.
-- create_candidate_place has no find-or-create behavior and private.locations carries a unique
-- constraint that raises a raw unique_violation on a repeat insert, so an idempotent ingestion
-- script needs a moderator-safe way to ask "did I already ingest this lead?" before calling
-- create_candidate_place again. This adds a lookup keyed on a stable ingestion lead id recorded
-- in evidence.source_metadata, and an index to keep that lookup cheap.

begin;

create index evidence_source_metadata_lead_id_idx
  on private.evidence ((source_metadata ->> 'leadId'))
  where source_metadata ? 'leadId';

create function public.get_moderation_place_by_lead_id(requested_lead_id text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_place_id uuid;
begin
  perform security.require_moderator();

  if requested_lead_id is null or btrim(requested_lead_id) = '' then
    raise exception using errcode = '22023', message = 'Lead identifier is required';
  end if;

  select evidence_record.place_id
  into found_place_id
  from private.evidence as evidence_record
  where evidence_record.source_metadata ->> 'leadId' = requested_lead_id
  order by evidence_record.created_at asc
  limit 1;

  return found_place_id;
end;
$$;

revoke execute on function public.get_moderation_place_by_lead_id(text)
  from public, anon, service_role;

grant execute on function public.get_moderation_place_by_lead_id(text)
  to authenticated;

comment on function public.get_moderation_place_by_lead_id(text) is
  'Returns the Place id already carrying Evidence for one ingestion lead id, or null. Used by scripted lead ingestion (launch-inventory) to stay idempotent without a raw insert.';

commit;
