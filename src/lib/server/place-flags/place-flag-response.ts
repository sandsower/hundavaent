import { privateJson } from '$server/http/private-json';
import type { PlaceFlagCommandResult, SubmittedPlaceFlag } from '$server/place-flags/place-flags';

/**
 * The one HTTP reading of a submission result. Corrections and Reports run through the same RPC
 * error mapping and must reach a client as the same statuses, so the translation lives once rather
 * than once per endpoint: a rate limit that answers 429 on one route and 503 on the other is a bug
 * a client cannot work around.
 */
export function submittedPlaceFlagResponse(
  result: PlaceFlagCommandResult<SubmittedPlaceFlag>
): Response {
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
