import { clearRequestAuthSession } from '$server/auth/callback';
import { AuthenticationExpiredError, getMemberSession } from '$server/auth/session';
import { privateJson } from '$server/http/private-json';

interface MemberGatedEvent {
  locals: { supabase: unknown };
  cookies: unknown;
}

/**
 * The member gate for private JSON endpoints. One definition on purpose: the orphaned-session
 * cleanup and the 401-versus-503 split are exactly the decisions that must not drift between two
 * copies of an auth check.
 *
 * Returns a response to send when the caller is not a Member, or null to continue.
 */
export async function requireMemberResponse(event: MemberGatedEvent): Promise<Response | null> {
  const supabase = event.locals.supabase as Parameters<typeof getMemberSession>[0] | null;
  const cookies = event.cookies as Parameters<typeof clearRequestAuthSession>[1];
  if (!supabase) return privateJson({ error: 'unavailable' }, 503);
  try {
    const session = await getMemberSession(supabase);
    if (session.status === 'orphaned') await clearRequestAuthSession(supabase, cookies);
    if (session.status !== 'member') return privateJson({ error: 'authentication_required' }, 401);
    return null;
  } catch (error) {
    if (error instanceof AuthenticationExpiredError) {
      await clearRequestAuthSession(supabase, cookies);
      return privateJson({ error: 'authentication_required' }, 401);
    }
    return privateJson({ error: 'unavailable' }, 503);
  }
}
