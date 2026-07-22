import { redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';

import type { PageServerLoad } from './$types';

// The Moderator guard for this load is enforced by the parent moderation +layout.server.ts.
export const load: PageServerLoad = ({ params }) => {
  const lang = parseLocale(params.lang);
  redirect(308, `/${lang}/moderation?queue=corrections-and-reports&filter=actionable`);
};
