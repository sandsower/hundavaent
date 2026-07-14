import { env } from '$env/dynamic/public';
import { json, type RequestHandler } from '@sveltejs/kit';

import { telemetryLogger } from '$server/telemetry/logger';

export const GET: RequestHandler = async ({ locals }) => {
  const map =
    env.PUBLIC_MAP_STYLE_URL?.trim() || env.PUBLIC_MAPTILER_KEY?.trim() ? 'configured' : 'fallback';

  if (!locals.supabase) {
    telemetryLogger.healthFailure({ requestId: locals.requestId, check: 'database' });
    return healthResponse(503, locals.requestId, 'unavailable', map);
  }

  const { error } = await locals.supabase.rpc('list_published_places', {
    requested_locale: 'is'
  });
  if (error) {
    telemetryLogger.healthFailure({ requestId: locals.requestId, check: 'database' });
    return healthResponse(503, locals.requestId, 'unavailable', map);
  }

  return healthResponse(200, locals.requestId, 'ready', map);
};

function healthResponse(
  status: 200 | 503,
  requestId: string,
  database: 'ready' | 'unavailable',
  map: 'configured' | 'fallback'
): Response {
  return json(
    {
      service: 'hundavaent',
      status: status === 200 ? 'ok' : 'unavailable',
      checks: { database, map },
      requestId
    },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-request-id': requestId
      }
    }
  );
}
