import { error, redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params, url }) => {
  const lang = parseLocale(params.lang);
  const moderationRoot = `/${lang}/moderation`;

  if (url.pathname === `${moderationRoot}/sign-in`) {
    return { moderator: null };
  }

  const returnTo = `${url.pathname}${url.search}`;
  const signInUrl = `${moderationRoot}/sign-in?returnTo=${encodeURIComponent(returnTo)}`;

  if (!locals.supabase) {
    redirect(303, signInUrl);
  }

  try {
    const moderator = await requireRole(locals.supabase, 'moderator');
    return { moderator };
  } catch (cause) {
    if (cause instanceof AuthenticationRequiredError) {
      redirect(303, signInUrl);
    }

    if (cause instanceof RoleRequiredError) {
      error(403, {
        message: locals.copy['moderation.unauthorized'],
        requestId: locals.requestId
      });
    }

    if (cause instanceof AuthenticationUnavailableError) {
      error(503, {
        message: locals.copy['error.unexpectedBody'],
        requestId: locals.requestId
      });
    }

    throw cause;
  }
};
