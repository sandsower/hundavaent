import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Cookies } from '@sveltejs/kit';

import type { Database } from './generated.types';

export type RequestSupabaseClient = SupabaseClient<Database>;

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

export function getSupabasePublicConfig(
  environment: Record<string, string | undefined>
): SupabasePublicConfig | null {
  const url = environment.PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = environment.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    return null;
  }

  return { url, publishableKey };
}

export function createRequestSupabaseClient(
  cookies: Pick<Cookies, 'getAll' | 'set'>,
  config: SupabasePublicConfig
): RequestSupabaseClient {
  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (pendingCookies) => {
        for (const { name, value, options } of pendingCookies) {
          cookies.set(name, value, withRequiredPath(options));
        }
      }
    }
  });
}

export interface SupabaseServiceConfig {
  url: string;
  secretKey: string;
}

export function getSupabaseServiceConfig(
  publicEnvironment: Record<string, string | undefined>,
  privateEnvironment: Record<string, string | undefined>
): SupabaseServiceConfig | null {
  const url = publicEnvironment.PUBLIC_SUPABASE_URL?.trim();
  const secretKey = privateEnvironment.SUPABASE_SECRET_KEY?.trim();

  if (!url || !secretKey) {
    return null;
  }

  return { url, secretKey };
}

/**
 * A client that bypasses row level security entirely. It exists for one thing: writing a Member's
 * photo bytes into `place-photos`, whose write policies are Moderator-only by design so that the
 * metadata strip cannot be skipped by a client that talks to Storage directly.
 *
 * It carries no session and never touches cookies, so it cannot be mistaken for the caller. Every
 * authorization decision about the object it writes is still taken by an RLS-respecting call: the
 * registration RPC runs as the Member, and the read gateways run as whoever is asking.
 */
export function createServiceRoleSupabaseClient(
  config: SupabaseServiceConfig
): RequestSupabaseClient {
  return createClient<Database>(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function withRequiredPath(options: CookieOptions): CookieOptions & { path: string } {
  return { ...options, path: options.path ?? '/' };
}
