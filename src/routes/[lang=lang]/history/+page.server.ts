import { error, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

import { catalogues, parseLocale } from '$i18n';
import {
  buildPersonalCheckInPage,
  buildPersonalPlacePage,
  listPersonalCheckIns,
  listPersonalPlaces
} from '$server/personal-history/personal-history';

import type { PageServerLoad } from './$types';

const pageSize = 24;
const mapLimit = 200;
const views = ['checkins', 'map'] as const;
type HistoryView = (typeof views)[number];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export const load: PageServerLoad = async ({ locals, params, parent, setHeaders, url }) => {
  const lang = parseLocale(params.lang);
  const layout = await parent();
  const signInRedirect = (): never => {
    const returnTo = `/${lang}/history${url.search}`;
    redirect(303, `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`);
  };
  if (!layout.signedIn) {
    signInRedirect();
  }
  if (!locals.supabase) {
    error(503, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
  }
  // Private personal-history route: session-gated above and never publicly cacheable, matching
  // the check-in API and the /favorites route's privacy posture.
  setHeaders({ 'cache-control': 'private, no-store', vary: 'cookie' });

  const view = parseView(url.searchParams.get('view'));
  const mapConfig = {
    mapStyleUrl: env.PUBLIC_MAP_STYLE_URL?.trim() || null,
    forceMapFailure: dev && url.searchParams.get('__mapFailure') === '1'
  };

  if (view === 'map') {
    // One extra row past the map window so a full page can be distinguished from a truncated one.
    const result = await listPersonalPlaces(locals.supabase, lang, {
      filter: 'all',
      limit: mapLimit + 1
    });
    if (result.status === 'authentication_required') {
      // A signed-in Auth identity whose Member activation is missing or revoked: the RPCs deny it
      // (42501) even though the session cookie exists, so send it through the same sign-in
      // return path as a signed-out Visitor instead of failing with a service error.
      signInRedirect();
    }
    if (result.status !== 'success') {
      error(503, {
        message: catalogues[lang]['error.unexpectedBody'],
        requestId: locals.requestId
      });
    }
    const page = buildPersonalPlacePage(result.value, mapLimit);
    return {
      view,
      mapPlaces: page.places,
      mapTruncated: page.nextCursor !== null,
      mapLimit,
      ...mapConfig
    };
  }

  if (view === 'checkins') {
    const rawBeforeCheckedInAt = url.searchParams.get('before');
    const rawBeforeCheckInId = url.searchParams.get('beforeCheckIn');
    const requestedBeforeCheckedInAt = validDate(rawBeforeCheckedInAt);
    const requestedBeforeCheckInId = rawBeforeCheckInId;
    const hasValidCursor = Boolean(
      requestedBeforeCheckedInAt &&
      requestedBeforeCheckInId &&
      uuidPattern.test(requestedBeforeCheckInId)
    );
    const hasCursorInput = rawBeforeCheckedInAt !== null || rawBeforeCheckInId !== null;
    if (hasCursorInput && !hasValidCursor) {
      error(400, {
        message: catalogues[lang]['error.unexpectedBody'],
        requestId: locals.requestId
      });
    }
    const result = await listPersonalCheckIns(locals.supabase, lang, {
      limit: pageSize + 1,
      beforeCheckedInAt: hasValidCursor ? requestedBeforeCheckedInAt : null,
      beforeCheckInId: hasValidCursor ? requestedBeforeCheckInId : null
    });
    if (result.status === 'authentication_required') {
      signInRedirect();
    }
    if (result.status !== 'success') {
      error(503, {
        message: catalogues[lang]['error.unexpectedBody'],
        requestId: locals.requestId
      });
    }
    const page = buildPersonalCheckInPage(result.value, pageSize);
    return {
      view,
      checkIns: page.checkIns,
      nextCheckInCursor: page.nextCursor,
      isFirstPage: !hasValidCursor,
      ...mapConfig
    };
  }

  error(400, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
};

function parseView(value: string | null): HistoryView {
  return (views as readonly string[]).includes(value ?? '') ? (value as HistoryView) : 'checkins';
}

function validDate(value: string | null): string | null {
  return value && timestampPattern.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}
