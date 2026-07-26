begin;

-- Partially accessible, and a correctable accessibility fact ------------------------------------
--
-- Two enum widenings, and nothing else. A value added by ALTER TYPE cannot be referenced in the
-- transaction that adds it, so the functions that read these values land in the next migration.
--
-- `partially_accessible` names the honest middle ground the two-state vocabulary could not: a
-- ground-floor terrace behind an accessible entrance, a step to the washroom, one entrance of
-- several. Forcing such a Place to `accessible` overstates it and to `not_accessible` erases it.
--
-- `wheelchair_accessibility` joins private.place_field so a Member can raise a Correction against
-- the stated accessibility the same way they correct any other Place fact: the flag row addresses
-- the field, the snapshot records what was published, and a Moderator applies or rejects it.

alter type private.wheelchair_accessibility add value 'partially_accessible' after 'accessible';

alter type private.place_field add value 'wheelchair_accessibility';

comment on column private.places.wheelchair_accessibility is
  'Moderator-maintained factual wheelchair accessibility state. Partially accessible names a Place that is accessible in part only. Unknown is explicit.';

commit;
