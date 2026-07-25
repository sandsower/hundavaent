begin;

-- The Moderator's draft starts from the Member's claim, and save_place_flag_moderation_draft deep
-- merges each saved section onto that baseline. A deep merge keeps every key the patch does not
-- name, so `needs_review` survived the Moderator writing the locale it named. The result was a
-- draft the apply path can never accept: validate_place_field_value rejects a flag naming a locale
-- the value also writes, which is exactly the shape the merge produced.
--
-- The hatch is a statement about the Member's own submission -- "I read this card in one language
-- and cannot write the other" -- and it has no meaning inside the Moderator's draft, where writing
-- the missing locale is the whole job. So the baseline carries the Member's text through and drops
-- the flag, leaving a one-locale field value that the both-locales rule rejects until the Moderator
-- completes it. The claim is still blocked while it is incomplete; it is no longer blocked forever.

create or replace function private.place_flag_resolution_baseline(requested_flag_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  flag_record private.place_flags%rowtype;
  place_version bigint;
  verification_record private.verifications%rowtype;
  application_value jsonb;
  dispute_value jsonb;
  transition_value jsonb;
begin
  select flag.* into flag_record
  from private.place_flags flag
  where flag.id = requested_flag_id;

  if not found then
    raise exception using errcode = '22023', message = 'Correction or Report was not found';
  end if;

  select place.version into place_version
  from private.places place
  where place.id = flag_record.place_id;

  if flag_record.kind = 'correction' and flag_record.target_kind = 'place_field' then
    application_value := jsonb_build_object(
      'expected_version', place_version,
      -- The only change from the previous definition: the omitted-locale flag does not travel into
      -- the draft. Removing an absent key is a no-op, so every other Place field is untouched.
      'field_value', flag_record.proposed_value - 'needs_review'
    );
  elsif flag_record.kind = 'correction' and flag_record.target_kind = 'access_condition' then
    select verification.* into verification_record
    from private.verifications verification
    where verification.access_condition_id = flag_record.access_condition_id
      and verification.superseded_at is null;

    application_value := jsonb_build_object(
      'expected_verification_id', verification_record.id,
      'replacement_condition', flag_record.proposed_value,
      'evidence', flag_record.evidence,
      'verified_at', statement_timestamp(),
      'freshness_until', verification_record.freshness_until
    );
  end if;

  if flag_record.target_kind = 'access_condition' then
    if verification_record.id is null then
      select verification.* into verification_record
      from private.verifications verification
      where verification.access_condition_id = flag_record.access_condition_id
        and verification.superseded_at is null;
    end if;
    dispute_value := jsonb_build_object(
      'expected_verification_id', verification_record.id,
      'reason', flag_record.explanation,
      'evidence', flag_record.evidence
    );
  end if;

  transition_value := jsonb_build_object(
    'expected_version', place_version,
    'decision_notes', flag_record.explanation
  );

  return jsonb_build_object(
    'application_payload', application_value,
    'dispute_command', dispute_value,
    'transition_command', transition_value
  );
end;
$$;

comment on function private.place_flag_resolution_baseline(uuid) is
  'Seeds a Correction or Report moderation draft from the claim. A place-field claim drops the omitted-locale flag, because completing the missing locale is the Moderator work the draft exists for.';

commit;
