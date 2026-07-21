import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { requireTranslationSession } from '$server/translations/access';
import { loadTranslationWorkspace } from '$server/translations/workspace';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const config = await requireTranslationSession(event, env);
  const { locals, url } = event;
  if (!config || !locals.supabase) {
    error(503, {
      message: 'The translation workspace is unavailable.',
      requestId: locals.requestId
    });
  }
  const result = await loadTranslationWorkspace(
    locals.supabase,
    config.databaseSecret,
    crypto.randomUUID()
  );
  if (result.status !== 'success') {
    error(503, {
      message: 'The translation workspace is unavailable.',
      requestId: locals.requestId
    });
  }
  const initialSearch = url.searchParams.get('search')?.trim().slice(0, 200) ?? '';
  return { workspace: result.value, initialSearch };
};
