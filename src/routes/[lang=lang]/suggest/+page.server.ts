import { randomUUID } from 'node:crypto';
import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';

import { parseLocale } from '$i18n';
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';
import { parseSuggestionFormData } from '$server/suggestions/suggestion-input';
import { submitSuggestion, type SuggestionRpcClient } from '$server/suggestions/suggestions';
import { serializeRedirectRecognition } from '$server/member-activity/redirect-recognition';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const lang = parseLocale(params.lang);
  const returnTo = `${url.pathname}${url.search}`;
  const presetCoordinates = parsePresetCoordinates(url.searchParams);
  const mapStyleUrl = env.PUBLIC_MAP_STYLE_URL?.trim() || null;

  if (!locals.supabase) {
    redirectToAccount(lang, returnTo);
  }

  try {
    await requireRole(locals.supabase, 'member');
    return { ...presetCoordinates, mapStyleUrl, commandId: randomUUID() };
  } catch (cause) {
    if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
      redirectToAccount(lang, returnTo);
    }
    if (cause instanceof AuthenticationUnavailableError) {
      return {
        unavailable: true as const,
        ...presetCoordinates,
        mapStyleUrl,
        commandId: randomUUID()
      };
    }
    throw cause;
  }
};

export const actions: Actions = {
  default: async ({ locals, params, request }) => {
    const lang = parseLocale(params.lang);
    if (!locals.supabase) return fail(401, { error: 'authentication_required' as const });

    try {
      await requireRole(locals.supabase, 'member');
    } catch (cause) {
      if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
        return fail(401, { error: 'authentication_required' as const });
      }
      return fail(503, { error: 'unavailable' as const });
    }

    const formData = await request.formData();
    const commandId = formData.get('commandId');
    if (typeof commandId !== 'string' || !uuidPattern.test(commandId)) {
      return fail(400, { error: 'invalid' as const });
    }
    const parsed = parseSuggestionFormData(formData, { locale: lang });
    if (!parsed.ok) return fail(400, { error: parsed.error });

    const result = await submitSuggestion(
      locals.supabase as unknown as SuggestionRpcClient,
      parsed.proposal,
      commandId
    );
    if (result.status !== 'success') {
      const status =
        result.status === 'rate_limited'
          ? 429
          : result.status === 'forbidden'
            ? 401
            : result.status === 'conflict'
              ? 409
              : result.status === 'invalid'
                ? 400
                : 503;
      return fail(status, { error: result.status });
    }

    redirect(
      303,
      `/${lang}/account/suggestions?${serializeRedirectRecognition(
        result.value.suggestionId,
        result.value.recognition
      )}`
    );
  }
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function redirectToAccount(lang: 'is' | 'en', returnTo: string): never {
  redirect(303, `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`);
}

// Preserves a discovery-selected map Location across the sign-in redirect so the
// Location picker below can be pre-filled once the Member returns to this page.
function parsePresetCoordinates(params: URLSearchParams): {
  presetLatitude: string | null;
  presetLongitude: string | null;
} {
  return {
    presetLatitude: parseCoordinate(params.get('latitude'), -90, 90),
    presetLongitude: parseCoordinate(params.get('longitude'), -180, 180)
  };
}

function parseCoordinate(value: string | null, minimum: number, maximum: number): string | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? value : null;
}
