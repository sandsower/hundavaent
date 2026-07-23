import type { RequestSupabaseClient } from '$server/db/clients';
import {
  mapFavouriteRecognition,
  type FavouriteRecognition
} from '$server/member-activity/weekly-rhythm';

export const authPendingIntentTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export type PendingIntentCompletion =
  | {
      status: 'completed';
      action: 'favourite';
      placeId: string;
      completionStatus: 'completed';
      recognition: FavouriteRecognition;
    }
  | {
      status: 'completed';
      action: 'rating';
      completionStatus: 'completed' | 'queued';
    }
  | { status: 'unavailable' }
  | { status: 'retryable' };

export async function completePendingAuthIntent(
  client: RequestSupabaseClient,
  pendingToken: string,
  requestId: string
): Promise<PendingIntentCompletion> {
  if (!authPendingIntentTokenPattern.test(pendingToken)) return { status: 'unavailable' };

  try {
    const { data, error } = await client.rpc('complete_auth_pending_intent', {
      pending_token: pendingToken,
      command_request_id: requestId
    });
    if (error) return { status: 'retryable' };

    const completion = data?.[0];
    if (!completion) return { status: 'unavailable' };
    if (completion.action !== 'favourite' && completion.action !== 'rating') {
      return { status: 'unavailable' };
    }
    if (completion.completion_status !== 'completed' && completion.completion_status !== 'queued') {
      return { status: 'unavailable' };
    }

    if (completion.action === 'favourite') {
      const recognition = mapFavouriteRecognition(completion);
      if (completion.completion_status !== 'completed' || !recognition) {
        return { status: 'unavailable' };
      }
      return {
        status: 'completed',
        action: 'favourite',
        placeId: completion.place_id,
        completionStatus: 'completed',
        recognition
      };
    }

    return {
      status: 'completed',
      action: 'rating',
      completionStatus: completion.completion_status
    };
  } catch {
    return { status: 'retryable' };
  }
}
