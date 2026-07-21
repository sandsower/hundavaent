import { env } from '$env/dynamic/private';
import { error, fail, redirect } from '@sveltejs/kit';

import { getTranslationAccessConfig } from '$server/translations/access';
import {
  loadTranslationWorkspace,
  restoreTranslationRevision,
  type TranslationWorkspace
} from '$server/translations/workspace';

import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async (event) => ({ workspace: await loadWorkspace(event) });

export const actions: Actions = {
  restore: async (event) => {
    const formData = await event.request.formData();
    const targetRevision = parsePositiveInteger(formData.get('targetRevision'));
    const expectedRevision = parsePositiveInteger(formData.get('expectedRevision'));
    if (!targetRevision || !expectedRevision || formData.get('confirm') !== 'restore') {
      return fail(400, { invalid: true });
    }

    const workspace = await loadWorkspace(event);
    if (workspace.currentRevision !== expectedRevision || workspace.pendingCount > 0) {
      return fail(409, { conflict: true });
    }
    if (!workspace.revisions.some((revision) => revision.revisionNumber === targetRevision)) {
      return fail(400, { invalid: true });
    }

    const config = getTranslationAccessConfig(env);
    if (!config || !event.locals.supabase) {
      error(503, {
        message: 'Revision restore is unavailable.',
        requestId: event.locals.requestId
      });
    }
    const result = await restoreTranslationRevision(
      event.locals.supabase,
      config.databaseSecret,
      targetRevision,
      expectedRevision,
      crypto.randomUUID()
    );
    if (result.status === 'conflict') return fail(409, { conflict: true });
    if (result.status !== 'success') {
      error(503, {
        message: 'Revision restore is unavailable.',
        requestId: event.locals.requestId
      });
    }
    redirect(303, `/translations/history?restored=${result.value.revisionNumber}`);
  }
};

async function loadWorkspace(event: RequestEvent): Promise<TranslationWorkspace> {
  const config = getTranslationAccessConfig(env);
  if (!config || !event.locals.supabase) {
    error(503, {
      message: 'Translation history is unavailable.',
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
      message: 'Translation history is unavailable.',
      requestId: event.locals.requestId
    });
  }
  return result.value;
}

function parsePositiveInteger(value: FormDataEntryValue | null): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
