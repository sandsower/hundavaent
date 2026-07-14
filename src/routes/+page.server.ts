import { redirect } from '@sveltejs/kit';

import { defaultLocale } from '$i18n';

export const load = () => redirect(307, `/${defaultLocale}`);
