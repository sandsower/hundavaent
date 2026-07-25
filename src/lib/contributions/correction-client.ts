import type { Locale } from '$i18n';
import { applyWeeklyRhythmRecognition } from '$lib/member-activity/client';
import { parseWeeklyRhythmRecognition } from '$lib/member-activity/types';
import type { MemberRestraintChoice } from '$lib/contributions/access-condition-correction';

export type CorrectionResult =
  | { status: 'submitted'; flagId: string }
  | { status: 'unchanged' }
  | { status: 'authentication_required' }
  | { status: 'rate_limited' }
  | { status: 'invalid' }
  | { status: 'unavailable' };

export interface AccessConditionCorrectionRequest {
  placeId: string;
  lang: Locale;
  accessConditionId: string;
  restraintCondition: MemberRestraintChoice;
  note: string | null;
}

/**
 * The transport for inline contribution. It owns the request shape and the result vocabulary so
 * every affordance on the place card reports the same outcomes, and holds no UI state of its own.
 */
export async function submitAccessConditionCorrection(
  request: AccessConditionCorrectionRequest
): Promise<CorrectionResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/places/${encodeURIComponent(request.placeId)}/corrections?lang=${request.lang}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID()
        },
        body: JSON.stringify({
          accessConditionId: request.accessConditionId,
          restraintCondition: request.restraintCondition,
          note: request.note
        })
      }
    );
  } catch {
    return { status: 'unavailable' };
  }

  if (response.status === 401) return { status: 'authentication_required' };
  if (response.status === 429) return { status: 'rate_limited' };
  if (response.status === 400) return { status: 'invalid' };
  if (!response.ok) return { status: 'unavailable' };

  let payload: { status?: unknown; flagId?: unknown; recognition?: unknown };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return { status: 'unavailable' };
  }

  if (payload.status === 'unchanged') return { status: 'unchanged' };
  if (payload.status !== 'submitted' || typeof payload.flagId !== 'string') {
    return { status: 'unavailable' };
  }

  // The weekly rhythm is global member state, so it is applied here rather than left to whichever
  // affordance happened to send the Correction.
  const recognition = parseWeeklyRhythmRecognition(payload.recognition, 'correction');
  if (recognition) applyWeeklyRhythmRecognition(recognition);

  return { status: 'submitted', flagId: payload.flagId };
}
