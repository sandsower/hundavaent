import { isLocale, type Locale } from '$i18n';
import type {
  AccessConditionCorrectionInput,
  PlaceFieldCorrectionInput
} from '$lib/contributions/correction';
import { requireMemberResponse } from '$server/auth/require-member-response';
import {
  describeAccessConditionChange,
  isUnchangedAccessCondition,
  proposedAccessCondition
} from '$server/contributions/access-condition-change';
import { parseCorrectionInput } from '$server/contributions/correction-input';
import {
  buildMemberExplanation,
  buildMemberReportEvidence,
  describePlaceFieldCorrection
} from '$server/contributions/member-evidence';
import {
  isUnchangedPlaceField,
  proposedPlaceFieldValue
} from '$server/contributions/place-field-change';
import { getPublishedProfile, getStoredAccessCondition } from '$server/discovery/public-places';
import { privateJson } from '$server/http/private-json';
import {
  listMyOpenPlaceFlags,
  submitCorrection,
  type PlaceFlagCommandResult,
  type PlaceFlagRpcClient,
  type SubmittedPlaceFlag
} from '$server/place-flags/place-flags';

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
  const input = parseCorrectionInput(body);
  if (!input) return privateJson({ error: 'invalid_request' }, 400);

  const commandId = suppliedCommandId ?? crypto.randomUUID();
  if (input.target === 'access_condition') {
    return correctAccessCondition(event, locale, input, commandId);
  }
  return correctPlaceField(event, locale, input, commandId);
};

/**
 * The Member's own open flags on this Place, so an affordance whose Correction is already waiting
 * says so instead of inviting a second one. `privateJson` sends `private, no-store` and
 * `vary: cookie`, which is what makes a per-caller projection safe on a cached route.
 */
export const GET: RequestHandler = async (event) => {
  if (!uuidPattern.test(event.params.id)) {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  const authError = await requireMemberResponse(event);
  if (authError) return authError;

  const result = await listMyOpenPlaceFlags(
    event.locals.supabase as unknown as PlaceFlagRpcClient,
    event.params.id
  );
  if (result.status !== 'success') {
    return privateJson(
      { error: result.status },
      result.status === 'forbidden' ? 401 : result.status === 'invalid' ? 400 : 503
    );
  }

  return privateJson({ pending: result.value });
};

async function correctAccessCondition(
  event: Parameters<RequestHandler>[0],
  locale: Locale,
  input: AccessConditionCorrectionInput,
  commandId: string
): Promise<Response> {
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
  if (isUnchangedAccessCondition(condition, input)) {
    return privateJson({ status: 'unchanged' });
  }

  const changeSummary = describeAccessConditionChange(condition, input, 'place-card');
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
      proposed_value: proposedAccessCondition(condition, input)
    },
    commandId
  );

  return correctionResponse(result);
}

async function correctPlaceField(
  event: Parameters<RequestHandler>[0],
  locale: Locale,
  input: PlaceFieldCorrectionInput,
  commandId: string
): Promise<Response> {
  const profileResult = await getPublishedProfile(event.locals.supabase!, event.params.id, locale);
  if (profileResult.status === 'not_found') return privateJson({ error: 'not_found' }, 404);
  if (profileResult.status !== 'success') return privateJson({ error: 'unavailable' }, 503);

  if (isUnchangedPlaceField(profileResult.value, input)) {
    return privateJson({ status: 'unchanged' });
  }

  // Structural, and it never names the value the Member typed. The summary becomes the Evidence
  // citation, which reaches anonymous callers through the published profile; the Member's own
  // words reach the explanation and stop there.
  const changeSummary = describePlaceFieldCorrection(input.field, 'place-card');
  const result = await submitCorrection(
    event.locals.supabase as unknown as PlaceFlagRpcClient,
    {
      target_kind: 'place_field',
      target_field: input.field,
      access_condition_id: null,
      place_id: event.params.id,
      explanation: buildMemberExplanation({ note: input.note, changeSummary }),
      evidence: buildMemberReportEvidence({
        note: input.note,
        changeSummary,
        observedAt: new Date().toISOString(),
        surface: 'place-card'
      }),
      proposed_value: proposedPlaceFieldValue(input, locale)
    },
    commandId
  );

  return correctionResponse(result);
}

function correctionResponse(result: PlaceFlagCommandResult<SubmittedPlaceFlag>): Response {
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
}
