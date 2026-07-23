import { clearRequestAuthSession } from '$server/auth/callback';
import { AuthenticationExpiredError, getMemberSession } from '$server/auth/session';
import {
  applyPendingRating,
  getMyRating,
  saveInlineRating,
  type DogFriendlinessRpcClient
} from '$server/dog-friendliness/dog-friendliness';
import { parseInlineRatingInput } from '$server/dog-friendliness/dog-friendliness-input';
import { privateJson } from '$server/http/private-json';

import type { RequestEvent, RequestHandler } from './$types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireMember(event: RequestEvent): Promise<Response | null> {
  if (!event.locals.supabase) return privateJson({ error: 'unavailable' }, 503);
  try {
    const session = await getMemberSession(event.locals.supabase);
    if (session.status === 'orphaned')
      await clearRequestAuthSession(event.locals.supabase, event.cookies);
    if (session.status !== 'member') return privateJson({ error: 'authentication_required' }, 401);
    return null;
  } catch (error) {
    if (error instanceof AuthenticationExpiredError) {
      await clearRequestAuthSession(event.locals.supabase, event.cookies);
      return privateJson({ error: 'authentication_required' }, 401);
    }
    return privateJson({ error: 'unavailable' }, 503);
  }
}

export const GET: RequestHandler = async (event) => {
  if (!uuidPattern.test(event.params.placeId))
    return privateJson({ error: 'invalid_request' }, 400);
  const authError = await requireMember(event);
  if (authError) return authError;
  const client = event.locals.supabase as unknown as DogFriendlinessRpcClient;
  const applied = await applyPendingRating(client, event.params.placeId);
  if (applied.status !== 'success') return privateJson({ error: 'unavailable' }, 503);
  const result = await getMyRating(client, event.params.placeId);
  if (result.status !== 'success') return privateJson({ error: 'unavailable' }, 503);
  return privateJson({ rating: result.value, recognition: applied.value.recognition });
};

export const PUT: RequestHandler = async (event) => {
  if (!uuidPattern.test(event.params.placeId))
    return privateJson({ error: 'invalid_request' }, 400);
  const authError = await requireMember(event);
  if (authError) return authError;
  const suppliedCommandId = event.request.headers.get('idempotency-key');
  if (suppliedCommandId !== null && !uuidPattern.test(suppliedCommandId)) {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  const commandId = suppliedCommandId ?? crypto.randomUUID();
  let input: unknown;
  try {
    input = await event.request.json();
  } catch {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  const parsed = parseInlineRatingInput(input);
  if (!parsed) return privateJson({ error: 'invalid_request' }, 400);
  const result = await saveInlineRating(
    event.locals.supabase as unknown as DogFriendlinessRpcClient,
    event.params.placeId,
    parsed,
    commandId
  );
  if (result.status !== 'success') {
    const status =
      result.status === 'forbidden'
        ? 401
        : result.status === 'invalid'
          ? 400
          : result.status === 'conflict'
            ? 409
            : 503;
    return privateJson({ error: result.status }, status);
  }
  return privateJson({ rating: result.value.rating, recognition: result.value.recognition });
};
