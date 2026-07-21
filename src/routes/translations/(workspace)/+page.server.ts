import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { getTranslationAccessConfig } from '$server/translations/access';
import { loadTranslationWorkspace } from '$server/translations/workspace';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const config = getTranslationAccessConfig(env);
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
  return { workspace: result.value };
};
