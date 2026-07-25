import type { Locale } from '$i18n';
import { applyWeeklyRhythmRecognition } from '$lib/member-activity/client';
import { parseWeeklyRhythmRecognition } from '$lib/member-activity/types';
import type {
  CorrectionInput,
  PendingPlaceFlag,
  PlaceReportReason
} from '$lib/contributions/correction';

export type CorrectionResult =
  | { status: 'submitted'; flagId: string }
  | { status: 'unchanged' }
  | { status: 'authentication_required' }
  | { status: 'rate_limited' }
  | { status: 'invalid' }
  | { status: 'unavailable' };

/**
 * The same vocabulary minus `unchanged`. A Report alleges rather than proposes, so there is no
 * published value it could match and nothing for the server to decline as a no-op.
 */
export type PlaceReportResult = Exclude<CorrectionResult, { status: 'unchanged' }>;

export type PendingCorrectionsResult =
  | { status: 'loaded'; pending: PendingPlaceFlag[] }
  | { status: 'authentication_required' }
  | { status: 'invalid' }
  | { status: 'unavailable' };

/**
 * The endpoint's own body, plus the addressing the URL needs. `placeId` and `lang` are deliberately
 * kept out of the payload the server parses.
 */
export type CorrectionRequest = CorrectionInput & { placeId: string; lang: Locale };

/**
 * The transport for inline contribution. It owns the request shape and the result vocabulary so
 * every affordance on the place card reports the same outcomes, and holds no UI state of its own.
 */
export async function submitInlineCorrection(
  request: CorrectionRequest
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
        body: JSON.stringify(correctionBody(request))
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

/**
 * The endpoint's own body, plus the addressing the URL needs. There is no `lang`: a place-level
 * Report carries no Member-written value, and the server builds its snapshot in both locales and
 * its summary from fixed labels.
 */
export type PlaceReportRequest = {
  placeId: string;
  reason: PlaceReportReason;
  note: string | null;
};

/**
 * The transport for a place-level Report. The reason is the whole claim: the mapping onto
 * `report_reason` and the safety bit is applied server-side, so a client cannot raise a safety
 * escalation by asking for one.
 */
export async function submitPlaceReport(request: PlaceReportRequest): Promise<PlaceReportResult> {
  let response: Response;
  try {
    response = await fetch(`/api/places/${encodeURIComponent(request.placeId)}/reports`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': crypto.randomUUID()
      },
      body: JSON.stringify({ reason: request.reason, note: request.note })
    });
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

  if (payload.status !== 'submitted' || typeof payload.flagId !== 'string') {
    return { status: 'unavailable' };
  }

  const recognition = parseWeeklyRhythmRecognition(payload.recognition, 'report');
  if (recognition) applyWeeklyRhythmRecognition(recognition);

  return { status: 'submitted', flagId: payload.flagId };
}

/**
 * The caller's own open flags on one Place. A signed-out reader has none to fetch, so the caller
 * decides whether to ask at all and reads `authentication_required` as "nothing pending".
 */
export async function fetchPendingCorrections(placeId: string): Promise<PendingCorrectionsResult> {
  let response: Response;
  try {
    response = await fetch(`/api/places/${encodeURIComponent(placeId)}/corrections`);
  } catch {
    return { status: 'unavailable' };
  }

  if (response.status === 401) return { status: 'authentication_required' };
  if (response.status === 400) return { status: 'invalid' };
  if (!response.ok) return { status: 'unavailable' };

  let payload: { pending?: unknown };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return { status: 'unavailable' };
  }

  if (!Array.isArray(payload.pending) || !payload.pending.every(isPendingPlaceFlag)) {
    return { status: 'unavailable' };
  }

  return { status: 'loaded', pending: payload.pending };
}

function correctionBody(request: CorrectionRequest): Record<string, unknown> {
  switch (request.target) {
    case 'access_condition':
      return {
        target: request.target,
        accessConditionId: request.accessConditionId,
        dimension: request.dimension,
        value: request.value,
        note: request.note
      };
    case 'place_field':
      return {
        target: request.target,
        field: request.field,
        value: request.value,
        note: request.note
      };
  }
}

function isPendingPlaceFlag(value: unknown): value is PendingPlaceFlag {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.kind === 'correction' || candidate.kind === 'report') &&
    (candidate.targetKind === 'place_field' ||
      candidate.targetKind === 'access_condition' ||
      candidate.targetKind === 'place') &&
    (candidate.targetField === null || typeof candidate.targetField === 'string') &&
    (candidate.accessConditionId === null || typeof candidate.accessConditionId === 'string') &&
    (candidate.reportReason === null || typeof candidate.reportReason === 'string') &&
    (candidate.status === 'submitted' || candidate.status === 'needs_information')
  );
}
