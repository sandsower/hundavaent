import { catalogues } from '$i18n';
import { privateJson } from '$server/http/private-json';
import {
  discardTranslationPackage,
  getTranslationAccess,
  listTranslationReviewPackages,
  loadTranslationPackage,
  loadTranslationWorkspace,
  reviewTranslationPackage,
  saveTranslationPackageEntry,
  startTranslationPackage,
  submitTranslationPackage,
  type TranslationPackageResult,
  type TranslationReviewSummary
} from '$server/translations/packages';

import type { RequestHandler } from './$types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.supabase) return privateJson({ error: 'unavailable' }, 503);
  const accessResult = await getTranslationAccess(locals.supabase);
  if (accessResult.status === 'none') return privateJson({ error: 'forbidden' }, 403);
  if (accessResult.status !== 'success') return privateJson({ error: 'unavailable' }, 503);

  const pageId = url.searchParams.get('pageId');
  if (!isPageId(pageId)) return privateJson({ error: 'invalid_request' }, 400);

  const workspaceResult = await loadTranslationWorkspace(locals.supabase, pageId);
  if (workspaceResult.status !== 'success') return resultError(workspaceResult);

  const requestedPackageId = url.searchParams.get('packageId');
  let selectedPackage = null;
  if (requestedPackageId !== null) {
    if (!uuidPattern.test(requestedPackageId)) {
      return privateJson({ error: 'invalid_request' }, 400);
    }
    const packageResult = await loadTranslationPackage(locals.supabase, requestedPackageId);
    if (packageResult.status !== 'success') return resultError(packageResult);
    selectedPackage = packageResult.value;
  }

  let reviewQueue: TranslationReviewSummary[] = [];
  if (accessResult.value.canReview) {
    const reviewResult = await listTranslationReviewPackages(locals.supabase);
    if (reviewResult.status !== 'success') return resultError(reviewResult);
    reviewQueue = reviewResult.value;
  }

  return privateJson({
    workspace: workspaceResult.value,
    selectedPackage,
    reviewQueue,
    catalogues
  });
};

export const PUT: RequestHandler = async ({ locals, request, url }) => {
  const accessResponse = await authorizeMutation(locals.supabase, request, url);
  if (accessResponse instanceof Response) return accessResponse;

  const body = await readJson(request);
  if (!isSaveBody(body)) return privateJson({ error: 'invalid_request' }, 400);
  const result = await saveTranslationPackageEntry(accessResponse, body);
  return result.status === 'success' ? privateJson({ entry: result.value }) : resultError(result);
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
  const client = await authorizeMutation(locals.supabase, request, url);
  if (client instanceof Response) return client;
  const body = await readJson(request);
  if (!isRecord(body) || typeof body.action !== 'string') {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  if (body.action === 'start' && isStartBody(body)) {
    const result = await startTranslationPackage(client, body);
    return result.status === 'success'
      ? privateJson({ package: result.value })
      : resultError(result);
  }
  if (body.action === 'submit' && isPackageVersionBody(body)) {
    const result = await submitTranslationPackage(client, body);
    return result.status === 'success'
      ? privateJson({ package: result.value })
      : resultError(result);
  }
  if (body.action === 'discard' && isPackageVersionBody(body)) {
    const result = await discardTranslationPackage(client, body);
    return result.status === 'success'
      ? privateJson({ package: result.value })
      : resultError(result);
  }
  if ((body.action === 'return' || body.action === 'approve') && isReviewBody(body)) {
    const result = await reviewTranslationPackage(client, {
      packageId: body.packageId,
      decision: body.action,
      note: body.action === 'return' ? body.note : null,
      expectedPackageVersion: body.expectedPackageVersion,
      requestId: body.requestId
    });
    return result.status === 'success'
      ? privateJson({ package: result.value })
      : resultError(result);
  }

  return privateJson({ error: 'invalid_request' }, 400);
};

async function authorizeMutation(
  client: App.Locals['supabase'],
  request: Request,
  url: URL
): Promise<NonNullable<App.Locals['supabase']> | Response> {
  if (!client) return privateJson({ error: 'unavailable' }, 503);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return privateJson({ error: 'invalid_request' }, 403);
  const accessResult = await getTranslationAccess(client);
  if (accessResult.status === 'none') return privateJson({ error: 'forbidden' }, 403);
  if (accessResult.status !== 'success') return privateJson({ error: 'unavailable' }, 503);
  return client;
}

function resultError(
  result: Exclude<TranslationPackageResult<unknown>, { status: 'success' }>
): Response {
  if (result.status === 'conflict') return privateJson({ error: 'conflict' }, 409);
  if (result.status === 'forbidden') return privateJson({ error: 'forbidden' }, 403);
  if (result.status === 'invalid_state') return privateJson({ error: 'invalid_state' }, 409);
  return privateJson({ error: 'unavailable' }, 503);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isPageId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.startsWith('/') && !/\s/.test(value) && value.length <= 240
  );
}

function isSaveBody(value: unknown): value is {
  packageId: string;
  key: string;
  valueIs: string;
  valueEn: string;
  expectedEntryVersion: number;
  requestId: string;
} {
  if (!isRecord(value)) return false;
  return (
    uuidPattern.test(String(value.packageId)) &&
    typeof value.key === 'string' &&
    value.key.length > 0 &&
    value.key.length <= 160 &&
    typeof value.valueIs === 'string' &&
    value.valueIs.length <= 10_000 &&
    typeof value.valueEn === 'string' &&
    value.valueEn.length <= 10_000 &&
    Number.isInteger(value.expectedEntryVersion) &&
    Number(value.expectedEntryVersion) >= 0 &&
    typeof value.requestId === 'string' &&
    requestIdPattern.test(value.requestId)
  );
}

function isStartBody(value: Record<string, unknown>): value is Record<string, unknown> & {
  action: 'start';
  pageId: string;
  contextPath: string;
  requestId: string;
} {
  return (
    value.action === 'start' &&
    isPageId(value.pageId) &&
    typeof value.contextPath === 'string' &&
    value.contextPath.startsWith('/') &&
    !/\s/.test(value.contextPath) &&
    value.contextPath.length <= 1024 &&
    typeof value.requestId === 'string' &&
    requestIdPattern.test(value.requestId)
  );
}

function isPackageVersionBody(value: Record<string, unknown>): value is Record<string, unknown> & {
  packageId: string;
  expectedPackageVersion: number;
  requestId: string;
} {
  return (
    typeof value.packageId === 'string' &&
    uuidPattern.test(value.packageId) &&
    Number.isInteger(value.expectedPackageVersion) &&
    Number(value.expectedPackageVersion) > 0 &&
    typeof value.requestId === 'string' &&
    requestIdPattern.test(value.requestId)
  );
}

function isReviewBody(value: Record<string, unknown>): value is Record<string, unknown> &
  (
    | {
        action: 'return';
        packageId: string;
        expectedPackageVersion: number;
        requestId: string;
        note: string;
      }
    | {
        action: 'approve';
        packageId: string;
        expectedPackageVersion: number;
        requestId: string;
      }
  ) {
  if (!isPackageVersionBody(value)) return false;
  if (value.action === 'approve') return value.note === undefined;
  return (
    value.action === 'return' &&
    typeof value.note === 'string' &&
    value.note.trim().length > 0 &&
    value.note.length <= 2000
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
