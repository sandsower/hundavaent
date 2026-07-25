import type {
  AccessArea,
  DogEligibility,
  PermissionRequirement,
  RestraintCondition
} from '$domain/access';
import {
  memberEligibilityChoiceFor,
  type MemberEligibilityChoice,
  type MemberEligibilityValue,
  type PlaceReportReason
} from '$lib/contributions/correction';
import type { FlagEvidence, PlaceField } from '$server/place-flags/place-flag-input';

/**
 * Member-facing contribution surfaces never ask a Member to fill in the Moderator's worksheet.
 * The server writes the Evidence record the database requires, and records here which surface
 * the claim came from and whether the citation is the Member's words or the server's.
 */
export type MemberContributionSurface = 'place-card' | 'correction-form' | 'report-form';

export interface MemberReportEvidenceInput {
  note: string | null;
  changeSummary: string;
  observedAt: string;
  surface: MemberContributionSurface;
}

const sourceLabels: Record<MemberContributionSurface, string> = {
  'place-card': 'Member report from the place page',
  'correction-form': 'Member report from the correction form',
  'report-form': 'Member report from the report form'
};

const surfaceNames: Record<MemberContributionSurface, string> = {
  'place-card': 'the place card',
  'correction-form': 'the correction form',
  'report-form': 'the report form'
};

/**
 * One label per place-level Report reason. Fixed strings, never the Member's own words: the summary
 * this builds becomes the Evidence citation, and a citation reaches anonymous callers through the
 * published profile.
 */
const placeReportNames: Record<PlaceReportReason, string> = {
  closed: 'Reported closed',
  moved: 'Reported moved',
  unsafe: 'Reported unsafe for dogs'
};

const restraintNames: Record<RestraintCondition, string> = {
  leash_required: 'leash required',
  off_leash_permitted: 'off-leash allowed',
  carrier_required: 'carrier required',
  other_sourced: 'other stated conditions'
};

const areaNames: Record<AccessArea, string> = {
  indoors: 'indoors',
  outdoors: 'outdoors',
  designated_area: 'a designated area',
  other_bounded: 'another stated area'
};

const permissionNames: Record<PermissionRequirement, string> = {
  standing_permission: 'standing permission',
  ask_on_arrival: 'ask on arrival',
  advance_approval: 'advance approval'
};

/**
 * Eligibility is named by the shape of the limit, never by the number that bounds it. A Member
 * types that number, and the summary becomes a citation an anonymous caller can read, so the same
 * rule that keeps the note out keeps the figure out. A Moderator reads the figure in
 * `proposed_value`, which is where it belongs.
 */
const eligibilityNames: Record<MemberEligibilityChoice | 'other', string> = {
  all_dogs: 'all dogs',
  maximum_weight_kg: 'a weight limit',
  maximum_dogs: 'a limit on the number of dogs',
  other: 'other stated restrictions'
};

const placeFieldNames: Record<PlaceField, string> = {
  name: 'the place name',
  description: 'the description',
  website_url: 'the website address',
  phone: 'the phone number',
  opening_hours: 'the opening hours',
  dog_amenities: 'the dog amenities'
};

export function buildMemberReportEvidence(input: MemberReportEvidenceInput): FlagEvidence {
  return {
    kind: 'member_report',
    source_url: null,
    // Always the server's own summary, never the Member's words. A Moderator's application draft
    // defaults to this Evidence record, applying it copies the citation into private.evidence, and
    // public.get_published_place_profile returns that citation to anonymous callers. The Member is
    // told their explanation is never published, so it stays in the Correction's explanation, which
    // no public projection reads, and never enters Evidence.
    source_citation: input.changeSummary,
    source_label: sourceLabels[input.surface],
    observed_at: input.observedAt,
    source_metadata: {
      submissionProfile: 'inline-v1',
      surface: input.surface,
      // Tells a Moderator the explanation holds the Member's own account, without copying those
      // words into a record that can reach the public profile.
      memberNoteProvided: meaningfulNote(input.note) !== null
    }
  };
}

export function buildMemberExplanation(input: {
  note: string | null;
  changeSummary: string;
}): string {
  return meaningfulNote(input.note) ?? input.changeSummary;
}

/**
 * English on purpose. The explanation and citation are read in the Moderation workspace, which
 * already uses English constants for server-written source labels.
 *
 * Every change summary is built from these enum label tables and nothing else. The summary becomes
 * the Evidence citation, which reaches anonymous callers through the published profile, so neither
 * the Member's note nor any stored free text may enter one.
 */
export function describeRestraintChange(
  from: RestraintCondition,
  to: RestraintCondition,
  surface: MemberContributionSurface
): string {
  return (
    `Restraint condition changed from ${restraintNames[from]} to ${restraintNames[to]}, ` +
    `reported from ${surfaceNames[surface]}.`
  );
}

export function describeAreaChange(
  from: AccessArea,
  to: AccessArea,
  surface: MemberContributionSurface
): string {
  return (
    `Access area changed from ${areaNames[from]} to ${areaNames[to]}, ` +
    `reported from ${surfaceNames[surface]}.`
  );
}

export function describePermissionChange(
  from: PermissionRequirement,
  to: PermissionRequirement,
  surface: MemberContributionSurface
): string {
  return (
    `Permission requirement changed from ${permissionNames[from]} to ${permissionNames[to]}, ` +
    `reported from ${surfaceNames[surface]}.`
  );
}

export function describeEligibilityChange(
  from: DogEligibility,
  to: MemberEligibilityValue,
  surface: MemberContributionSurface
): string {
  return (
    `Dog eligibility changed from ${eligibilityName(from)} to ${eligibilityName(to)}, ` +
    `reported from ${surfaceNames[surface]}.`
  );
}

export function describePlaceFieldCorrection(
  field: PlaceField | null,
  surface: MemberContributionSurface
): string {
  const target = field === null ? 'an access condition' : placeFieldNames[field];
  return `Correction to ${target}, reported from ${surfaceNames[surface]}.`;
}

/**
 * A place-level Report names the reason and the surface and nothing else. It has no from-and-to
 * pair, because a Report alleges rather than proposes, and the Member's note is not part of the
 * claim's identity: it reaches the Moderator through `explanation` and stops there.
 */
export function describePlaceReport(
  reason: PlaceReportReason,
  surface: MemberContributionSurface
): string {
  return `${placeReportNames[reason]} from ${surfaceNames[surface]}.`;
}

function eligibilityName(eligibility: DogEligibility): string {
  return eligibilityNames[memberEligibilityChoiceFor(eligibility) ?? 'other'];
}

function meaningfulNote(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
