import { env } from '$env/dynamic/private';

import { requireTranslationSession } from '$server/translations/access';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  await requireTranslationSession(event, env);
  return {};
};
