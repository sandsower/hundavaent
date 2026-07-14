begin;

create table private.evidence (
  id uuid primary key default extensions.gen_random_uuid(),
  place_id uuid not null references private.places(id) on delete cascade,
  kind private.evidence_kind not null,
  source_url text check (source_url is null or source_url ~ '^https?://'),
  source_citation text check (source_citation is null or btrim(source_citation) <> ''),
  source_label text not null check (btrim(source_label) <> ''),
  observed_at timestamptz not null,
  recorded_by uuid,
  source_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint evidence_has_source_check check (
    source_url is not null or source_citation is not null
  )
);

create table private.access_conditions (
  id uuid primary key default extensions.gen_random_uuid(),
  place_id uuid not null references private.places(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  supersedes_condition_id uuid unique
    references private.access_conditions(id) on delete restrict,
  access_area private.access_area not null,
  restraint_condition private.restraint_condition not null,
  dog_eligibility jsonb not null default '{"scope":"all_dogs"}'::jsonb
    check (
      jsonb_typeof(dog_eligibility) = 'object'
      and dog_eligibility ? 'scope'
      and dog_eligibility ->> 'scope' in ('all_dogs', 'restricted')
    ),
  availability_window jsonb not null default '{}'::jsonb
    check (jsonb_typeof(availability_window) = 'object'),
  permission_requirement private.permission_requirement not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint access_condition_supersession_time_check check (
    superseded_at is null or superseded_at >= created_at
  )
);

create table private.verifications (
  id uuid primary key default extensions.gen_random_uuid(),
  access_condition_id uuid not null
    references private.access_conditions(id) on delete restrict,
  status private.verification_status not null,
  verified_by uuid,
  verified_at timestamptz not null,
  freshness_until timestamptz not null,
  decision_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(decision_metadata) = 'object'),
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint verification_freshness_check check (freshness_until > verified_at),
  constraint verification_supersession_time_check check (
    superseded_at is null or superseded_at >= verified_at
  )
);

create table private.verification_evidence (
  verification_id uuid not null
    references private.verifications(id) on delete cascade,
  evidence_id uuid not null
    references private.evidence(id) on delete restrict,
  primary key (verification_id, evidence_id)
);

create index evidence_observed_at_idx
  on private.evidence (observed_at desc);

create index evidence_place_idx
  on private.evidence (place_id);

create index access_conditions_place_idx
  on private.access_conditions (place_id);

create index access_conditions_current_place_idx
  on private.access_conditions (place_id)
  where superseded_at is null;

create index verifications_access_condition_idx
  on private.verifications (access_condition_id);

create unique index verifications_one_current_per_condition_idx
  on private.verifications (access_condition_id)
  where superseded_at is null;

create index verifications_public_eligibility_idx
  on private.verifications (access_condition_id, freshness_until)
  where status = 'verified' and superseded_at is null;

create index verification_evidence_evidence_idx
  on private.verification_evidence (evidence_id);

alter table private.evidence enable row level security;
alter table private.access_conditions enable row level security;
alter table private.verifications enable row level security;
alter table private.verification_evidence enable row level security;

comment on table private.evidence is
  'A recorded source claim. Evidence supports but never constitutes a Verification.';

comment on table private.access_conditions is
  'A structured dog-access rule for one Place, retaining area, restraint, eligibility, availability, and permission dimensions.';

comment on table private.verifications is
  'An immutable Moderator determination about one Access Condition.';

comment on table private.verification_evidence is
  'Supporting Evidence links for a Verification. Publication requires at least one link.';

commit;
