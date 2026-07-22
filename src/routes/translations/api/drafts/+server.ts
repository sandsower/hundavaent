import { env } from '$env/dynamic/private';

import { privateJson } from '$server/http/private-json';
import { authenticateTranslationSession } from '$server/translations/access';
import { loadTranslationWorkspace, saveTranslationDraft } from '$server/translations/workspace';
import { TRANSLATION_VALUE_MAX_LENGTH } from '$lib/translations/placeholders';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, locals }) => {
  const access = await authenticateTranslationSession(cookies, env);
  if (access === 'unavailable') return privateJson({ error: 'unavailable' }, 503);
  if (access === 'authentication_required') return privateJson({ error: access }, 401);
  if (!locals.supabase) return privateJson({ error: 'unavailable' }, 503);

  const result = await loadTranslationWorkspace(
    locals.supabase,
    access.databaseSecret,
    crypto.randomUUID()
  );
  if (result.status !== 'success') return privateJson({ error: 'unavailable' }, 503);
  return privateJson({ workspace: result.value });
};

export const PUT: RequestHandler = async ({ cookies, locals, request, url }) => {
  const access = await authenticateTranslationSession(cookies, env);
  if (access === 'unavailable') return privateJson({ error: 'unavailable' }, 503);
  if (access === 'authentication_required') return privateJson({ error: access }, 401);
  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) {
    return privateJson({ error: 'invalid_request' }, 403);
  }
  if (!locals.supabase) return privateJson({ error: 'unavailable' }, 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  if (!isSaveBody(body)) return privateJson({ error: 'invalid_request' }, 400);

  const result = await saveTranslationDraft(
    locals.supabase,
    access.databaseSecret,
    body,
    crypto.randomUUID()
  );
  if (result.status === 'conflict') return privateJson({ error: 'conflict' }, 409);
  if (result.status !== 'success') return privateJson({ error: 'unavailable' }, 503);
  return privateJson({ ...result.value });
};

function isSaveBody(value: unknown): value is {
  key: string;
  locale: 'is' | 'en';
  value: string;
  expectedPublicationRevision: number | null;
  expectedDraftVersion: number;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return (
    Object.keys(body).length === 5 &&
    typeof body.key === 'string' &&
    (body.locale === 'is' || body.locale === 'en') &&
    typeof body.value === 'string' &&
    body.value.length <= TRANSLATION_VALUE_MAX_LENGTH &&
    (body.expectedPublicationRevision === null ||
      (Number.isInteger(body.expectedPublicationRevision) &&
        Number(body.expectedPublicationRevision) > 0)) &&
    Number.isInteger(body.expectedDraftVersion) &&
    Number(body.expectedDraftVersion) >= 0
  );
}
