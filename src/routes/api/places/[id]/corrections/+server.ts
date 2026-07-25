import type { AvailabilityWindow } from '$domain/access';
import { isLocale } from '$i18n';
import { requireMemberResponse } from '$server/auth/require-member-response';
import { parseAccessConditionCorrectionInput } from '$server/contributions/access-condition-correction-input';
import {
  buildMemberExplanation,
  buildMemberReportEvidence,
  describeRestraintChange
} from '$server/contributions/member-evidence';
import {
  getStoredAccessCondition,
  type PublishedAccessFacts
} from '$server/discovery/public-places';
import type { Json } from '$server/db/generated.types';
import { privateJson } from '$server/http/private-json';
import type { AccessConditionValue } from '$server/place-flags/place-flag-input';
import { submitCorrection, type PlaceFlagRpcClient } from '$server/place-flags/place-flags';

import type { RequestHandler } from './$types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST: RequestHandler = async (event) => {
  const locale = event.url.searchParams.get('lang');
  if (!isLocale(locale) || !uuidPattern.test(event.params.id)) {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  const suppliedCommandId = event.request.headers.get('idempotency-key');
  if (suppliedCommandId !== null && !uuidPattern.test(suppliedCommandId)) {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  const authError = await requireMemberResponse(event);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  const input = parseAccessConditionCorrectionInput(body);
  if (!input) return privateJson({ error: 'invalid_request' }, 400);

  // The stored condition, not the visitor projection: the proposal has to carry the Place's real
  // notes through, and it is read only by Moderators.
  const conditionResult = await getStoredAccessCondition(
    event.locals.supabase!,
    event.params.id,
    input.accessConditionId,
    locale
  );
  if (conditionResult.status === 'not_found') return privateJson({ error: 'not_found' }, 404);
  if (conditionResult.status !== 'success') return privateJson({ error: 'unavailable' }, 503);
  const condition = conditionResult.value;

  // The client-side disabled confirm is a convenience, not the guard: the profile it decided
  // against can be stale, and a no-op flag is work a Moderator should never be handed.
  if (condition.restraintCondition === input.restraintCondition) {
    return privateJson({ status: 'unchanged' });
  }

  const changeSummary = describeRestraintChange(
    condition.restraintCondition,
    input.restraintCondition,
    'place-card'
  );
  const result = await submitCorrection(
    event.locals.supabase as unknown as PlaceFlagRpcClient,
    {
      target_kind: 'access_condition',
      target_field: null,
      access_condition_id: condition.id,
      place_id: event.params.id,
      explanation: buildMemberExplanation({ note: input.note, changeSummary }),
      evidence: buildMemberReportEvidence({
        note: input.note,
        changeSummary,
        observedAt: new Date().toISOString(),
        surface: 'place-card'
      }),
      proposed_value: proposedCondition(condition, input.restraintCondition)
    },
    suppliedCommandId ?? crypto.randomUUID()
  );

  if (result.status !== 'success') {
    const status =
      result.status === 'rate_limited'
        ? 429
        : result.status === 'forbidden'
          ? 401
          : result.status === 'conflict'
            ? 409
            : result.status === 'invalid'
              ? 400
              : 503;
    return privateJson({ error: result.status }, status);
  }

  return privateJson({
    status: 'submitted',
    flagId: result.value.flagId,
    recognition: result.value.recognition
  });
};

/**
 * The client sends the condition id and the intended restraint, never a whole condition. The
 * published condition is the source of truth for every other dimension, so a client that gets
 * one wrong, or lies about one, cannot rewrite it through a Correction.
 */
function proposedCondition(
  condition: PublishedAccessFacts,
  restraintCondition: AccessConditionValue['restraint_condition']
): AccessConditionValue {
  return {
    access_area: condition.accessArea,
    access_area_note: condition.accessAreaNote,
    restraint_condition: restraintCondition,
    // The existing note describes the rule being replaced, so carrying it forward would attach a
    // stale justification to the new one.
    restraint_note: null,
    dog_eligibility: condition.dogEligibility,
    availability_state: condition.availabilityState ?? 'not_stated',
    availability_window: availabilityWindowJson(condition.availabilityWindow),
    permission_requirement: condition.permissionRequirement
  };
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
