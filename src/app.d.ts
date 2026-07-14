import type { RequestSupabaseClient } from './lib/server/db/clients';

declare global {
  namespace App {
    interface Error {
      message: string;
      requestId?: string;
    }

    interface Locals {
      requestId: string;
      supabase: RequestSupabaseClient | null;
    }

    interface Platform {
      env: Record<string, unknown>;
      ctx: {
        waitUntil(promise: Promise<unknown>): void;
      };
      cf?: Record<string, unknown>;
      caches: CacheStorage;
    }
  }
}

export {};
