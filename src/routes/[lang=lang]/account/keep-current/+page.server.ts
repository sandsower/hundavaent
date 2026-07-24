import { randomUUID } from 'node:crypto';
import { error, fail, redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';
import { readEvidence } from '$server/place-flags/place-flag-input';
import {
  listMyTrustedVerificationSubmissions,
  listTrustedVerificationTasks,
  submitTrustedVerificationTask,
  type TrustedVerificationRpcClient
} from '$server/trusted-verification/trusted-verification';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const lang = parseLocale(params.lang);
  const returnTo = `${url.pathname}${url.search}`;
  if (!locals.supabase) redirectToAccount(lang, returnTo);

  try {
    await requireRole(locals.supabase, 'member');
  } catch (cause) {
    if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
      redirectToAccount(lang, returnTo);
    }
    if (cause instanceof AuthenticationUnavailableError) {
      error(503, {
        message: locals.copy['error.unexpectedBody'],
        requestId: locals.requestId
      });
    }
    throw cause;
  }

  const client = locals.supabase as unknown as TrustedVerificationRpcClient;
  const [tasks, history] = await Promise.all([
    listTrustedVerificationTasks(client, lang),
    listMyTrustedVerificationSubmissions(client, lang)
  ]);

  if (history.status !== 'success') {
    error(503, {
      message: locals.copy['error.unexpectedBody'],
      requestId: locals.requestId
    });
  }
  if (
    tasks.status !== 'success' &&
    tasks.status !== 'forbidden' &&
    tasks.status !== 'policy_unavailable'
  ) {
    error(503, {
      message: locals.copy['error.unexpectedBody'],
      requestId: locals.requestId
    });
  }

  const availableTasks = tasks.status === 'success' ? tasks.value : [];
  return {
    canVerify: tasks.status === 'success',
    tasks: availableTasks,
    history: history.value,
    taskRequestIds: Object.fromEntries(availableTasks.map((task) => [task.taskId, randomUUID()]))
  };
};

export const actions: Actions = {
  default: async ({ locals, request }) => {
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
    const commandId = value(formData, 'commandId');
    const taskId = value(formData, 'taskId');
    const explanation = value(formData, 'explanation');
    const evidence = readEvidence(formData);

    if (!uuidPattern.test(commandId) || !taskId || !explanation || !evidence) {
      return fail(400, { error: 'incomplete' as const, taskId });
    }

    const amenities = taskId.startsWith('dog_amenities:') ? readAmenities(formData) : null;
    const response = taskId.startsWith('access_freshness:')
      ? { confirmed: true }
      : amenities
        ? { dog_amenities: amenities }
        : null;

    if (!response || amenities?.length === 0) {
      return fail(400, { error: 'invalid' as const, taskId });
    }

    const result = await submitTrustedVerificationTask(
      locals.supabase as unknown as TrustedVerificationRpcClient,
      {
        taskId,
        response,
        evidence,
        explanation
      },
      commandId
    );

    if (result.status !== 'success') {
      const status =
        result.status === 'rate_limited'
          ? 429
          : result.status === 'forbidden'
            ? 403
            : result.status === 'conflict'
              ? 409
              : result.status === 'invalid'
                ? 400
                : 503;
      return fail(status, { error: result.status, taskId });
    }

    return {
      success: result.value.outcome,
      taskId,
      weeklyActivated: result.value.activatedCurrentWeek
    };
  }
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function readAmenities(formData: FormData): string[] {
  return [
    ...new Set(
      value(formData, 'amenities')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

function redirectToAccount(lang: 'is' | 'en', returnTo: string): never {
  redirect(303, `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`);
}
