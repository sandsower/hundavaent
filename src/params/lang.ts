import type { ParamMatcher } from '@sveltejs/kit';

import { isLocale } from '$i18n/locale';

// Matchers are client-bundled, so this may only import locale identity (locale.ts, zero
// imports), never '$i18n' itself - the index module carries both full message catalogues.
export const match: ParamMatcher = (param) => isLocale(param);
