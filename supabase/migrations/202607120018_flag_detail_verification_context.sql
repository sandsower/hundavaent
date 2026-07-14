-- correction-and-report review fast-follow: fold the current Access Condition verification's freshness date and
-- status, and its provenance (Evidence source types and dates), directly into the Moderator flag
-- detail RPC. Previously a Moderator had to cross-reference the freshness workspace to see
-- this; get_moderation_place_flag already returned current_verification_id, so this migration
-- adds the freshness/provenance content behind that same identifier, in the same shape convention
-- get_published_place_profile already uses for verification evidence (camelCase jsonb keys).
--
-- RETURNS TABLE column lists cannot be widened with CREATE OR REPLACE FUNCTION, so the function is
-- dropped and recreated; the authorization boundary (security.require_moderator(), same denial
-- behavior) and every existing column are preserved exactly.

begin;

drop function if exists public.get_moderation_place_flag(uuid);

create function public.get_moderation_place_flag(requested_flag_id uuid)
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
  current_value_snapshot jsonb,
  current_live_value jsonb,
  current_place_version bigint,
  current_verification_id uuid,
  current_verification_status text,
  current_verification_verified_at timestamptz,
  current_verification_freshness_until timestamptz,
  current_verification_evidence jsonb,
  proposed_value jsonb,
  report_reason text,
  is_safety_concern boolean,
  successor_place_id uuid,
  explanation text,
  evidence jsonb,
  private_note text,
  applied_access_condition_id uuid,
  dispute_id uuid,
  transition_id uuid,
  contribution_id uuid,
  submitted_at timestamptz,
  updated_at timestamptz
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
    flag.id,
    flag.member_id,
    flag.kind::text,
    flag.status::text,
    flag.place_id,
    translations.name_is,
    translations.name_en,
    flag.target_kind::text,
    flag.target_field::text,
    flag.access_condition_id,
    flag.current_value_snapshot,
    case
      when flag.target_kind = 'place_field'
        then private.snapshot_place_field(flag.place_id, flag.target_field)
      else private.snapshot_access_condition(flag.access_condition_id, flag.place_id)
    end,
    place_record.version,
    verification_record.id,
    verification_record.status::text,
    verification_record.verified_at,
    verification_record.freshness_until,
    (
      select jsonb_agg(jsonb_build_object(
        'kind', evidence_record.kind,
        'sourceUrl', evidence_record.source_url,
        'sourceCitation', evidence_record.source_citation,
        'sourceLabel', evidence_record.source_label,
        'observedAt', evidence_record.observed_at
      ) order by evidence_record.observed_at desc, evidence_record.source_label, evidence_record.id)
      from private.verification_evidence verification_link
      join private.evidence evidence_record on evidence_record.id = verification_link.evidence_id
      where verification_link.verification_id = verification_record.id
    ),
    flag.proposed_value,
    flag.report_reason::text,
    flag.is_safety_concern,
    flag.successor_place_id,
    flag.explanation,
    flag.evidence,
    latest.private_note,
    flag.applied_access_condition_id,
    flag.dispute_id,
    flag.transition_id,
    contribution.id,
    flag.submitted_at,
    flag.updated_at
  from private.place_flags flag
  left join private.places place_record on place_record.id = flag.place_id
  left join private.verifications verification_record
    on verification_record.access_condition_id = flag.access_condition_id
    and verification_record.superseded_at is null
  cross join lateral (
    select
      max(translation.name) filter (where translation.locale = 'is') as name_is,
      max(translation.name) filter (where translation.locale = 'en') as name_en
    from private.place_translations translation
    where translation.place_id = flag.place_id
  ) as translations
  left join lateral (
    select event.private_note
    from private.place_flag_status_events event
    where event.flag_id = flag.id and event.private_note is not null
    order by event.occurred_at desc, event.id desc
    limit 1
  ) as latest on true
  left join private.contributions contribution on contribution.place_flag_id = flag.id
  where flag.id = requested_flag_id;
end;
$$;

revoke execute on function public.get_moderation_place_flag(uuid) from public, anon, service_role;
grant execute on function public.get_moderation_place_flag(uuid) to authenticated;

comment on function public.get_moderation_place_flag(uuid) is
  'Moderator-only Correction/Report detail, including the target Place''s current live value, and'
  ' - for an Access Condition target with a current verification - that verification''s status,'
  ' freshness dates, and Evidence provenance, so a Moderator does not need to cross-reference the'
  ' separate freshness workspace.';

commit;
