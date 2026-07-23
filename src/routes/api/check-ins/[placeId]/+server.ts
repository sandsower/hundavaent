import { isProximityDecision } from '$lib/check-ins/proximity';
import { getCurrentCheckInStatus, recordCheckIn } from '$server/check-ins/check-ins';
import { privateJson } from '$server/http/private-json';

import type { RequestHandler } from './$types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!uuidPattern.test(params.placeId)) {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  if (!locals.supabase) return privateJson({ error: 'unavailable' }, 503);

  try {
    const { data, error } = await locals.supabase.auth.getUser();
    if (error || !data.user) return privateJson({ error: 'authentication_required' }, 401);
  } catch {
    return privateJson({ error: 'unavailable' }, 503);
  }

  const result = await getCurrentCheckInStatus(locals.supabase, params.placeId);
  if (result.status !== 'success') {
    return privateJson({ error: 'unavailable' }, 503);
  }
  return privateJson({
    hasRecentCheckIn: result.value.hasRecentCheckIn,
    checkedInAt: result.value.checkedInAt,
    proximityConfirmed: result.value.proximityConfirmed
  });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!uuidPattern.test(params.placeId)) {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  if (!locals.supabase) return privateJson({ error: 'unavailable' }, 503);
  const suppliedCommandId = request.headers.get('idempotency-key');
  if (suppliedCommandId !== null && !uuidPattern.test(suppliedCommandId)) {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  const commandId = suppliedCommandId ?? crypto.randomUUID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  // The body must be exactly { proximityDecision }: unknown keys are rejected so a
  // coordinate-shaped field can never be silently accepted by a future refactor.
  if (
    typeof body !== 'object' ||
    body === null ||
    Object.keys(body).length !== 1 ||
    !('proximityDecision' in body)
  ) {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  const { proximityDecision } = body as { proximityDecision: unknown };
  if (!isProximityDecision(proximityDecision)) {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  try {
    const { data, error } = await locals.supabase.auth.getUser();
    if (error || !data.user) return privateJson({ error: 'authentication_required' }, 401);
  } catch {
    return privateJson({ error: 'unavailable' }, 503);
  }

  const result = await recordCheckIn(locals.supabase, params.placeId, proximityDecision, commandId);
  if (result.status === 'place_unavailable') {
    return privateJson({ error: 'place_unavailable' }, 409);
  }
  if (result.status !== 'success') {
    return privateJson({ error: 'unavailable' }, 409);
  }
  return privateJson({
    checkInId: result.value.checkInId,
    placeId: result.value.placeId,
    proximityConfirmed: result.value.proximityConfirmed,
    checkedInAt: result.value.checkedInAt,
    alreadyCheckedIn: result.value.alreadyCheckedIn,
    recognition: result.value.recognition
  });
};
