import { privateJson } from '$server/http/private-json';
import {
  TRANSLATION_MODE_COOKIE,
  TRANSLATION_MODE_MAX_AGE_SECONDS
} from '$server/translations/mode';
import { getTranslationAccess } from '$server/translations/packages';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, locals, request, url }) => {
  if (!locals.supabase) return privateJson({ error: 'unavailable' }, 503);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return privateJson({ error: 'invalid_request' }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  if (!isRecord(body) || typeof body.active !== 'boolean') {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  const access = await getTranslationAccess(locals.supabase);
  if (access.status === 'none') return privateJson({ error: 'forbidden' }, 403);
  if (access.status !== 'success') return privateJson({ error: 'unavailable' }, 503);

  if (body.active) {
    cookies.set(TRANSLATION_MODE_COOKIE, 'active', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: url.protocol === 'https:',
      maxAge: TRANSLATION_MODE_MAX_AGE_SECONDS
    });
  } else {
    cookies.delete(TRANSLATION_MODE_COOKIE, { path: '/' });
  }

  return privateJson({ active: body.active });
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
