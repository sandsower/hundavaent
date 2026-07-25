import type { AvailabilityWindow } from '$domain/access';
import type { AccessConditionDimensionChange } from '$lib/contributions/access-condition-correction';
import type { Json } from '$server/db/generated.types';
import type { PublishedAccessFacts } from '$server/discovery/public-places';
import type { AccessConditionValue } from '$server/place-flags/place-flag-input';

import {
  describeAreaChange,
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
  }
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
