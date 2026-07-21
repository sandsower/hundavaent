import { env as privateEnv } from '$env/dynamic/private';
import { env } from '$env/dynamic/public';
import { json, type RequestHandler } from '@sveltejs/kit';

import { telemetryLogger } from '$server/telemetry/logger';
import {
  loadPublishedCatalogue,
  type PublishedTranslationClient
} from '$server/translations/published-catalogue';

export const GET: RequestHandler = async ({ locals }) => {
  const map =
    env.PUBLIC_MAP_STYLE_URL?.trim() || env.PUBLIC_MAPTILER_KEY?.trim() ? 'configured' : 'fallback';

  if (!locals.supabase) {
    telemetryLogger.healthFailure({ requestId: locals.requestId, check: 'database' });
    return healthResponse(503, locals.requestId, 'unavailable', map, 'fallback');
  }

  const { error } = await locals.supabase.rpc('list_published_places', {
    requested_locale: 'is'
  });
  if (error) {
    telemetryLogger.healthFailure({ requestId: locals.requestId, check: 'database' });
    return healthResponse(503, locals.requestId, 'unavailable', map, 'fallback');
  }

  const translations = await loadPublishedCatalogue(
    locals.supabase as unknown as PublishedTranslationClient,
    'is'
  );

  return healthResponse(
    200,
    locals.requestId,
    'ready',
    map,
    translations.source === 'bundled' ? 'fallback' : 'published'
  );
};

function healthResponse(
  status: 200 | 503,
  requestId: string,
  database: 'ready' | 'unavailable',
  map: 'configured' | 'fallback',
  translations: 'fallback' | 'published'
): Response {
  const evaluationServerId = privateEnv.HUNDAVAENT_EVALUATION_SERVER_ID?.trim();
  const release = privateEnv.APP_RELEASE?.trim() || null;

  return json(
    {
      service: 'hundavaent',
      status: status === 200 ? 'ok' : 'unavailable',
      release,
      checks: { database, map, translations },
      requestId
    },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-request-id': requestId,
        ...(evaluationServerId ? { 'x-hundavaent-evaluation-server': evaluationServerId } : {})
      }
    }
  );
}
