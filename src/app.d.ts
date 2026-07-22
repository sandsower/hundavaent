import type { RequestSupabaseClient } from './lib/server/db/clients';
import type { Catalogue } from './lib/i18n';

declare global {
  namespace App {
    interface Error {
      message: string;
      requestId?: string;
    }

    interface Locals {
      copy: Catalogue;
      requestId: string;
      supabase: RequestSupabaseClient | null;
      translationRevision: string | null;
      translationSource: 'bundled' | 'published';
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
