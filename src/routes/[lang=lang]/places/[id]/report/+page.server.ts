import { randomUUID } from 'node:crypto';
import { error, fail, redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';
import {
  buildMemberReportEvidence,
  describePlaceReport
} from '$server/contributions/member-evidence';
import { getPublishedProfile } from '$server/discovery/public-places';
import { isReportReason, parseReportFormData } from '$server/place-flags/place-flag-input';
import { submitReport, type PlaceFlagRpcClient } from '$server/place-flags/place-flags';
import { serializeRedirectRecognition } from '$server/member-activity/redirect-recognition';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const lang = parseLocale(params.lang);
  const returnTo = `${url.pathname}${url.search}`;
  const signInUrl = accountRedirectUrl(lang, returnTo);

  if (!locals.supabase) {
    error(503, { message: locals.copy['error.unexpectedBody'], requestId: locals.requestId });
  }

  const profileResult = await getPublishedProfile(locals.supabase, params.id, lang);
  if (profileResult.status === 'not_found') {
    error(404, { message: locals.copy['error.notFoundBody'], requestId: locals.requestId });
  }
  if (profileResult.status !== 'success') {
    error(503, { message: locals.copy['error.unexpectedBody'], requestId: locals.requestId });
  }

  const presetField = url.searchParams.get('field');
  const presetConditionId = url.searchParams.get('conditionId');
  // The form opens on the whole Place unless the link named a narrower target, and on the reason
  // the link named if it named one. Nothing in the product produces `?reason=` today: the card's
  // three claims submit straight to the API and never route through this form. It is kept, and
  // validated, because this page is an addressable URL - a Moderator or a support reply can hand a
  // Member a link that opens on the claim they were just asked about - and because dropping it
  // would silently ignore a parameter a Member can already see in the query string.
  const requestedReason = url.searchParams.get('reason');
  const presetReason = isReportReason(requestedReason) ? requestedReason : null;

  try {
    await requireRole(locals.supabase, 'member');
    return {
      signInUrl: null,
      place: profileResult.value,
      presetField,
      presetConditionId,
      presetReason,
      commandId: randomUUID()
    };
  } catch (cause) {
    if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
      return {
        signInUrl,
        place: profileResult.value,
        presetField,
        presetConditionId,
        presetReason
      };
    }
    if (cause instanceof AuthenticationUnavailableError) {
      return {
        unavailable: true as const,
        signInUrl: null,
        place: profileResult.value,
        presetField,
        presetConditionId,
        presetReason
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
    formData.set('placeId', params.id);
    // The Member is never asked to construct an Evidence record. The server writes it, truthfully
    // labelled as a Member report, and cites its own summary of the reason rather than the Member's
    // explanation, which no public projection may ever reach.
    const requestedReason = formData.get('reportReason');
    const parsed = parseReportFormData(
      formData,
      buildMemberReportEvidence({
        note: String(formData.get('explanation') ?? ''),
        changeSummary: describePlaceReport(
          isReportReason(requestedReason) ? requestedReason : null,
          'report-form'
        ),
        observedAt: new Date().toISOString(),
        surface: 'report-form'
      })
    );
    if (!parsed.ok) return fail(400, { error: parsed.error });

    const result = await submitReport(
      locals.supabase as unknown as PlaceFlagRpcClient,
      parsed.payload,
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
      `/${lang}/account/corrections-and-reports?${serializeRedirectRecognition(
        result.value.flagId,
        result.value.recognition
      )}`
    );
  }
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function accountRedirectUrl(lang: 'is' | 'en', returnTo: string): string {
  return `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`;
}
