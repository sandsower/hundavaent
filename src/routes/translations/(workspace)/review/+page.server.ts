import { env } from '$env/dynamic/private';
import { error, fail, redirect } from '@sveltejs/kit';

import {
  requireTranslationSession,
  type TranslationAccessConfig
} from '$server/translations/access';
import {
  loadTranslationWorkspace,
  readyTranslationDraftsForSource,
  type TranslationWorkspace
} from '$server/translations/workspace';
import { validateTranslationEntry } from '$lib/translations/placeholders';

import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async (event) => {
  const config = await requireTranslationSession(event, env);
  return { workspace: await loadWorkspace(event, config) };
};

export const actions: Actions = {
  ready: async (event) => {
    const config = await requireTranslationSession(event, env);
    const formData = await event.request.formData();
    const expectedRevision = parseRevision(formData.get('expectedRevision'));
    const expectedDraftGeneration = parseGeneration(formData.get('expectedDraftGeneration'));
    const workspace = await loadWorkspace(event, config);
    if (
      workspace.currentRevision !== expectedRevision ||
      workspace.draftGeneration !== expectedDraftGeneration
    ) {
      return fail(409, { conflict: true });
    }
    const invalidKeys = workspace.entries
      .filter(
        (entry) => validateTranslationEntry(entry.key, entry.draft.is, entry.draft.en).length > 0
      )
      .map((entry) => entry.key);
    if (invalidKeys.length > 0) return fail(400, { invalidKeys });
    if (workspace.pendingCount === 0) return fail(400, { noChanges: true });

    if (!event.locals.supabase) {
      error(503, {
        message: 'Source readiness is unavailable.',
        requestId: event.locals.requestId
      });
    }
    const result = await readyTranslationDraftsForSource(
      event.locals.supabase,
      config.databaseSecret,
      expectedRevision,
      expectedDraftGeneration,
      crypto.randomUUID()
    );
    if (result.status === 'conflict') return fail(409, { conflict: true });
    if (result.status !== 'success') {
      error(503, {
        message: 'Source readiness is unavailable.',
        requestId: event.locals.requestId
      });
    }
    redirect(303, `/translations?ready=${result.value.revisionNumber}`);
  }
};

async function loadWorkspace(
  event: RequestEvent,
  config: TranslationAccessConfig
): Promise<TranslationWorkspace> {
  if (!event.locals.supabase) {
    error(503, {
      message: 'The translation workspace is unavailable.',
      requestId: event.locals.requestId
    });
  }
  const result = await loadTranslationWorkspace(
    event.locals.supabase,
    config.databaseSecret,
    crypto.randomUUID()
  );
  if (result.status !== 'success') {
    error(503, {
      message: 'The translation workspace is unavailable.',
      requestId: event.locals.requestId
    });
  }
  return result.value;
}

function parseRevision(value: FormDataEntryValue | null): number | null {
  if (value === 'none') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseGeneration(value: FormDataEntryValue | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
}
