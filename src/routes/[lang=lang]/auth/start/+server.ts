import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { json, type RequestHandler } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import { passwordlessResendCooldownSeconds } from '$lib/auth/resend';
import { authPendingIntentTokenPattern } from '$server/auth/callback';
import {
  buildMemberCallbackUrl,
  getMemberAuthConfig,
  sendPasswordlessEmail,
  startFacebookSignIn
} from '$server/auth/member';
import {
  createAuthPendingIntentProof,
  createAuthPendingIntentSubject
} from '$server/auth/member-activation-proof';
import { resolveConfiguredMemberProviders } from '$server/auth/provider-policy';
import { isValidEmail, normalizeMemberReturnTo } from '$server/auth/return-to';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST: RequestHandler = async ({ getClientAddress, locals, params, request }) => {
  const lang = parseLocale(params.lang);
  const formData = await request.formData();
  const method = formData.get('method');
  const returnTo = normalizeMemberReturnTo(formData.get('returnTo'), lang);

  if ((method !== 'email' && method !== 'facebook') || !locals.supabase) {
    return json({ error: 'unavailable' }, { status: 503 });
  }

  const email = method === 'email' ? String(formData.get('email') ?? '').trim() : '';
  if (method === 'email' && !isValidEmail(email)) {
    return json({ error: 'email_invalid' }, { status: 400 });
  }

  const resolution = getMemberAuthConfig({ ...publicEnv, ...privateEnv });
  if (resolution.status !== 'ready') return json({ error: 'unavailable' }, { status: 503 });

  const providers = await resolveConfiguredMemberProviders(locals.supabase, resolution);
  if (!providers?.[method]) return json({ error: 'unavailable' }, { status: 503 });

  let clientAddress = '';
  try {
    clientAddress = getClientAddress();
  } catch {
    // Generic sign-in and continuation reuse do not need a new creation capability.
  }
  const pendingIntent = await _createPendingIntent(locals.supabase, formData, {
    secret: privateEnv.MEMBER_ACTIVATION_SECRET,
    clientAddress,
    requestId: locals.requestId
  });
  if (pendingIntent.status === 'invalid') {
    return json({ error: 'invalid_intent' }, { status: 400 });
  }
  if (pendingIntent.status === 'failed') {
    return json({ error: 'unavailable' }, { status: 503 });
  }
  if (pendingIntent.status === 'throttled') {
    return json({ error: 'rate_limited' }, { status: 429 });
  }

  const callbackUrl = buildMemberCallbackUrl(
    resolution.config,
    lang,
    returnTo,
    method,
    'token' in pendingIntent ? pendingIntent.token : null
  );

  if (method === 'facebook') {
    const result = await startFacebookSignIn(locals.supabase, callbackUrl);
    return result.status === 'redirect'
      ? json({ status: 'redirect', url: result.url })
      : json({ error: 'provider_failed' }, { status: 503 });
  }

  const result = await sendPasswordlessEmail(locals.supabase, email, callbackUrl);
  return result === 'sent'
    ? json({ status: 'link_sent', resendAfterSeconds: passwordlessResendCooldownSeconds })
    : json({ error: 'provider_failed' }, { status: 503 });
};

export async function _createPendingIntent(
  client: NonNullable<App.Locals['supabase']>,
  formData: FormData,
  creation?: { secret: string | undefined; clientAddress: string; requestId: string }
): Promise<
  | { status: 'none'; token: null }
  | { status: 'ready'; token: string }
  | { status: 'invalid' | 'failed' | 'throttled' }
> {
  const existingToken = String(formData.get('pendingIntentToken') ?? '');
  if (existingToken) {
    if (!authPendingIntentTokenPattern.test(existingToken)) return { status: 'invalid' };
    try {
      const { data, error } = await client.rpc('get_auth_pending_intent', {
        pending_token: existingToken,
        requested_locale: 'en'
      });
      return error || !data?.[0]
        ? { status: 'invalid' }
        : { status: 'ready', token: existingToken };
    } catch {
      return { status: 'failed' };
    }
  }

  const action = formData.get('intentAction');
  if (action === null || action === '') return { status: 'none', token: null };
  if (action !== 'favourite' && action !== 'rating') return { status: 'invalid' };

  const placeId = String(formData.get('placeId') ?? '');
  const ratingValue = action === 'rating' ? Number(formData.get('overallRating')) : null;
  if (
    !uuidPattern.test(placeId) ||
    (action === 'rating' &&
      (!Number.isInteger(ratingValue) || ratingValue! < 1 || ratingValue! > 5))
  ) {
    return { status: 'invalid' };
  }

  if (!creation) return { status: 'failed' };
  const creationSubject = await createAuthPendingIntentSubject(
    creation.secret,
    creation.clientAddress
  );
  if (!creationSubject) return { status: 'failed' };
  const creationProof = await createAuthPendingIntentProof(
    creation.secret,
    creationSubject,
    action,
    placeId,
    ratingValue,
    creation.requestId
  );
  if (!creationProof) return { status: 'failed' };

  try {
    const { data, error } = await client.rpc('create_auth_pending_intent', {
      requested_action: action,
      requested_place_id: placeId,
      requested_overall_rating: ratingValue,
      creation_subject: creationSubject,
      creation_request_id: creation.requestId,
      creation_proof: creationProof
    });
    if (error?.code === '54000') return { status: 'throttled' };
    return error || !data ? { status: 'failed' } : { status: 'ready', token: data };
  } catch {
    return { status: 'failed' };
  }
}
