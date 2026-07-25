import type { AvailabilityWindow, DogEligibility } from '$domain/access';
import type {
  AccessConditionDimensionChange,
  MemberEligibilityValue
} from '$lib/contributions/correction';
import type { Json } from '$server/db/generated.types';
import type { PublishedAccessFacts } from '$server/discovery/public-places';
import type { AccessConditionValue } from '$server/place-flags/place-flag-input';

import {
  describeAreaChange,
  describeEligibilityChange,
  describePermissionChange,
  describeRestraintChange,
  type MemberContributionSurface
} from './member-evidence';

/**
 * Everything the endpoint needs to turn "this dimension now reads that" into a Correction: the
 * no-op verdict, the proposed Condition, and the summary a Moderator reads. Each is a switch over
 * the same union, so a new dimension is three compile errors rather than a silent gap.
 */

export function isUnchangedAccessCondition(
  condition: PublishedAccessFacts,
  change: AccessConditionDimensionChange
): boolean {
  switch (change.dimension) {
    case 'restraint':
      return condition.restraintCondition === change.value;
    case 'area':
      return condition.accessArea === change.value;
    case 'permission':
      return condition.permissionRequirement === change.value;
    case 'eligibility':
      return isUnchangedEligibility(condition.dogEligibility, change.value);
  }
}

/**
 * A stored eligibility carrying a sourced note is never unchanged, because the proposal cannot
 * carry that note and dropping it is a change a Moderator has to see.
 */
function isUnchangedEligibility(stored: DogEligibility, proposed: MemberEligibilityValue): boolean {
  const proposedWeight = 'maximumWeightKg' in proposed ? proposed.maximumWeightKg : undefined;
  const proposedDogs = 'maximumDogs' in proposed ? proposed.maximumDogs : undefined;
  return (
    stored.scope === proposed.scope &&
    stored.notes === undefined &&
    stored.maximumWeightKg === proposedWeight &&
    stored.maximumDogs === proposedDogs
  );
}

/**
 * The client sends the Condition id and one dimension's intended value, never a whole Condition.
 * The stored Condition is the source of truth for every other dimension, so a client that gets one
 * wrong, or lies about one, cannot rewrite it through a Correction.
 */
export function proposedAccessCondition(
  condition: PublishedAccessFacts,
  change: AccessConditionDimensionChange
): AccessConditionValue {
  const carried: AccessConditionValue = {
    access_area: condition.accessArea,
    access_area_note: condition.accessAreaNote,
    restraint_condition: condition.restraintCondition,
    restraint_note: condition.restraintNote,
    dog_eligibility: condition.dogEligibility,
    availability_state: condition.availabilityState ?? 'not_stated',
    availability_window: availabilityWindowJson(condition.availabilityWindow),
    permission_requirement: condition.permissionRequirement
  };

  // The uniform note rule: a sourced note describes the value being replaced, so carrying it
  // forward would attach a stale justification to the new one. Only the changed dimension's note
  // drops; every other dimension keeps its own.
  switch (change.dimension) {
    case 'restraint':
      return { ...carried, restraint_condition: change.value, restraint_note: null };
    case 'area':
      return { ...carried, access_area: change.value, access_area_note: null };
    case 'permission':
      // Permission carries no sourced note of its own, so there is nothing for the rule to drop.
      return { ...carried, permission_requirement: change.value };
    case 'eligibility':
      // The Member's eligibility has no `notes` key at all, so replacing the object wholesale is
      // what drops the sourced note the rule requires dropping.
      return { ...carried, dog_eligibility: change.value };
  }
}

export function describeAccessConditionChange(
  condition: PublishedAccessFacts,
  change: AccessConditionDimensionChange,
  surface: MemberContributionSurface
): string {
  switch (change.dimension) {
    case 'restraint':
      return describeRestraintChange(condition.restraintCondition, change.value, surface);
    case 'area':
      return describeAreaChange(condition.accessArea, change.value, surface);
    case 'permission':
      return describePermissionChange(condition.permissionRequirement, change.value, surface);
    case 'eligibility':
      return describeEligibilityChange(condition.dogEligibility, change.value, surface);
  }
}

function availabilityWindowJson(window: AvailabilityWindow): Record<string, Json> {
  return {
    ...(window.days ? { days: [...window.days] } : {}),
    ...(window.startsAt ? { startsAt: window.startsAt } : {}),
    ...(window.endsAt ? { endsAt: window.endsAt } : {}),
    ...(window.startsOn ? { startsOn: window.startsOn } : {}),
    ...(window.endsOn ? { endsOn: window.endsOn } : {}),
    ...(window.notes ? { notes: window.notes } : {})
  };
}
