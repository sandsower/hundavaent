import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
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

function withRequiredPath(options: CookieOptions): CookieOptions & { path: string } {
  return { ...options, path: options.path ?? '/' };
}
