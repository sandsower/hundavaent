begin;

-- Only Evidence that a Moderator attached to a verified Access Condition may become the canonical
-- public Website. Raw Evidence arrays stay private, an explicit Website wins, and this works for
-- Candidate creation as well as later verification on an already-published Place.
create or replace function private.promote_verified_official_website()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.places as place
  set website_url = evidence.source_url
  from private.evidence as evidence
  join private.verifications as verification
    on verification.id = new.verification_id
  join private.access_conditions as access_condition
    on access_condition.id = verification.access_condition_id
  where evidence.id = new.evidence_id
    and evidence.kind = 'official_website'::private.evidence_kind
    and evidence.source_url is not null
    and verification.status = 'verified'::private.verification_status
    and verification.superseded_at is null
    and access_condition.place_id = evidence.place_id
    and place.id = evidence.place_id
    and place.website_url is null;

  return new;
end;
$$;

revoke execute on function private.promote_verified_official_website()
  from public, anon, authenticated, service_role;

drop trigger if exists promote_verified_official_website on private.verification_evidence;
create trigger promote_verified_official_website
after insert on private.verification_evidence
for each row execute function private.promote_verified_official_website();

-- Backfill official sites that were already verified before the canonical promotion rule existed.
with ranked_official_sites as (
  select distinct on (evidence.place_id)
    evidence.place_id,
    evidence.source_url
  from private.evidence as evidence
  join private.verification_evidence as link on link.evidence_id = evidence.id
  join private.verifications as verification on verification.id = link.verification_id
  join private.access_conditions as access_condition
    on access_condition.id = verification.access_condition_id
    and access_condition.place_id = evidence.place_id
  where evidence.kind = 'official_website'::private.evidence_kind
    and evidence.source_url is not null
    and verification.status = 'verified'::private.verification_status
    and verification.superseded_at is null
  order by evidence.place_id, evidence.observed_at desc, evidence.created_at desc, evidence.id
)
update private.places as place
set website_url = official_site.source_url
from ranked_official_sites as official_site
where place.id = official_site.place_id
  and place.website_url is null;

commit;
