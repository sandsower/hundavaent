begin;

-- The omitted-locale hatch for name and description Corrections ---------------------------------
--
-- validate_place_field_value required both `is` and `en`, non-empty, on every name and description
-- Correction. No server read returns a Place's name in both locales, and the inline editor asks a
-- Member for one language, the one they are reading the card in. Under the old rule the only ways
-- to satisfy it were to copy the typed text into the other locale or to guess it, both of which
-- publish something nobody wrote.
--
-- A Correction may now omit the other locale's key entirely and name that locale in `needs_review`
-- instead. Moderation fills the named locale before the draft can be applied, so no published
-- value is ever half-translated. The both-locales-no-flag shape stays exactly as valid as it was,
-- which is what leaves every existing caller and the Moderator apply path untouched.

create or replace function private.validate_place_field_value(
  requested_field private.place_field,
  value jsonb
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  flagged_locale text;
  written_locale text;
begin
  if value is null or jsonb_typeof(value) <> 'object' then
    raise exception using errcode = '22023', message = 'Correction value is invalid';
  end if;

  case requested_field
    when 'name', 'description' then
      if not private.jsonb_has_only_keys(value, array['is', 'en', 'needs_review']) then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;

      if pg_catalog.jsonb_exists(value, 'needs_review') then
        flagged_locale := value ->> 'needs_review';
        if flagged_locale is null or flagged_locale <> all (array['is', 'en']::text[]) then
          raise exception using errcode = '22023', message = 'Correction value is invalid';
        end if;

        -- A flag naming a locale the value also writes is a contradiction, not a hatch.
        written_locale := case when flagged_locale = 'is' then 'en' else 'is' end;
        if pg_catalog.jsonb_exists(value, flagged_locale)
          or nullif(btrim(value ->> written_locale), '') is null
        then
          raise exception using errcode = '22023', message = 'Correction value is invalid';
        end if;
      elsif nullif(btrim(value ->> 'is'), '') is null
        or nullif(btrim(value ->> 'en'), '') is null
      then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;
    when 'website_url' then
      if not private.jsonb_has_only_keys(value, array['value'])
        or (
          value -> 'value' is not null
          and jsonb_typeof(value -> 'value') not in ('string', 'null')
        )
        or (
          jsonb_typeof(value -> 'value') = 'string'
          and value ->> 'value' !~ '^https?://\S+$'
        )
      then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;
    when 'phone' then
      if not private.jsonb_has_only_keys(value, array['value'])
        or (
          value -> 'value' is not null
          and jsonb_typeof(value -> 'value') not in ('string', 'null')
        )
        or (
          jsonb_typeof(value -> 'value') = 'string'
          and nullif(btrim(value ->> 'value'), '') is null
        )
      then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;
    when 'opening_hours' then
      if not private.jsonb_has_only_keys(value, array['value'])
        or jsonb_typeof(coalesce(value -> 'value', '{}'::jsonb)) <> 'object'
      then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;
    when 'dog_amenities' then
      if not private.jsonb_has_only_keys(value, array['value'])
        or not private.jsonb_is_string_array(coalesce(value -> 'value', '[]'::jsonb))
      then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;
  end case;
end;
$$;

comment on function private.validate_place_field_value(private.place_field, jsonb) is
  'Validates a Correction value per Place field. Name and description accept the omitted-locale hatch: the written locale must be present and non-empty, and needs_review names the absent one.';

commit;
