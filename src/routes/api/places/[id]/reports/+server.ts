import type { PlaceReportReason } from '$lib/contributions/correction';
import { requireMemberResponse } from '$server/auth/require-member-response';
import { parsePlaceReportInput } from '$server/contributions/correction-input';
import {
  buildMemberExplanation,
  buildMemberReportEvidence,
  describePlaceReport
} from '$server/contributions/member-evidence';
import { privateJson } from '$server/http/private-json';
import type { ReportReason } from '$server/place-flags/place-flag-input';
import { submittedPlaceFlagResponse } from '$server/place-flags/place-flag-response';
import { submitReport, type PlaceFlagRpcClient } from '$server/place-flags/place-flags';

import type { RequestHandler } from './$types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Decision 2 of the phase 3 design, applied here rather than sent by the card.
 *
 * A member-initiated "unsafe for dogs" is definitionally a safety concern, so the escalation bit
 * rides with the reason instead of depending on Moderator inference. "Moved" deliberately carries
 * no successor: naming the new Place is `successor_place` on the report form, where a Member who
 * actually knows the new location can pick it.
 */
const reportMapping: Record<PlaceReportReason, { reason: ReportReason; isSafetyConcern: boolean }> =
  {
    closed: { reason: 'closed', isSafetyConcern: false },
    moved: { reason: 'moved', isSafetyConcern: false },
    unsafe: { reason: 'unsafe', isSafetyConcern: true }
  };

export const POST: RequestHandler = async (event) => {
  if (!uuidPattern.test(event.params.id)) {
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
  const input = parsePlaceReportInput(body);
  if (!input) return privateJson({ error: 'invalid_request' }, 400);

  const mapping = reportMapping[input.reason];
  // Structural, and it never names anything the Member typed. The summary becomes the Evidence
  // citation, which reaches anonymous callers through the published profile; the Member's own
  // words reach the explanation and stop there.
  const changeSummary = describePlaceReport(input.reason, 'place-card');
  const result = await submitReport(
    event.locals.supabase as unknown as PlaceFlagRpcClient,
    {
      target_kind: 'place',
      target_field: null,
      access_condition_id: null,
      place_id: event.params.id,
      explanation: buildMemberExplanation({ note: input.note, changeSummary }),
      evidence: buildMemberReportEvidence({
        note: input.note,
        changeSummary,
        observedAt: new Date().toISOString(),
        surface: 'place-card'
      }),
      report_reason: mapping.reason,
      is_safety_concern: mapping.isSafetyConcern,
      successor_place_id: null
    },
    suppliedCommandId ?? crypto.randomUUID()
  );

  return submittedPlaceFlagResponse(result);
};
