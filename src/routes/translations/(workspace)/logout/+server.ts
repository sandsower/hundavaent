import { redirect } from '@sveltejs/kit';

import { TRANSLATION_COOKIE_NAME } from '$server/translations/access';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
  cookies.delete(TRANSLATION_COOKIE_NAME, { path: '/translations' });
  redirect(303, '/translations/sign-in');
};
