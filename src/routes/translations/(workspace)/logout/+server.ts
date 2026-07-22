import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';

import { requireTranslationSession, TRANSLATION_COOKIE_NAME } from '$server/translations/access';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  await requireTranslationSession(event, env);
  const { cookies } = event;
  cookies.delete(TRANSLATION_COOKIE_NAME, { path: '/translations' });
  redirect(303, '/translations/sign-in');
};
