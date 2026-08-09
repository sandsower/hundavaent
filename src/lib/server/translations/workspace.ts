import { catalogues, type Locale, type MessageKey } from '$i18n';

import {
  createReadWorkspaceProof,
  createReadySourceProof,
  createRestoreToDraftsProof,
  createSaveDraftProof
} from './proof';
import { TRANSLATION_VALUE_MAX_LENGTH } from '$lib/translations/placeholders';

export interface TranslationWorkspaceEntry {
  key: MessageKey;
  namespace: string;
  published: Record<Locale, string>;
  draft: Record<Locale, string>;
  versions: Record<Locale, number>;
  changed: Record<Locale, boolean>;
}

export interface TranslationRevision {
  revisionNumber: number;
  kind: 'inventory_sync' | 'publish' | 'restore' | 'source_ready' | 'draft_restore';
  changeCount: number;
  publishedAt: string;
  restoredFromRevisionNumber: number | null;
}

export interface TranslationSourceCandidate {
  revisionNumber: number;
  readyAt: string;
  changeCount: number;
  status: 'ready' | 'applied' | 'superseded';
}

export interface TranslationWorkspace {
  currentRevision: number | null;
  publishedAt: string | null;
  draftGeneration: number;
  pendingCount: number;
  sourceCandidate: TranslationSourceCandidate | null;
  entries: TranslationWorkspaceEntry[];
  revisions: TranslationRevision[];
}

export interface SavedTranslationDraft {
  key: MessageKey;
  locale: Locale;
  value: string;
  version: number;
  changed: boolean;
  pendingCount: number;
  currentRevision: number | null;
}

export interface ReadyTranslationSource {
  revisionNumber: number;
  readyAt: string;
  changeCount: number;
}

export interface RestoredTranslationDrafts {
  revisionNumber: number;
  restoredAt: string;
  pendingCount: number;
}

export interface TranslationRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}

export type TranslationWorkspaceResult<T> =
  { status: 'success'; value: T } | { status: 'conflict' } | { status: 'infrastructure_error' };

export interface SaveTranslationDraftCommand {
  key: string;
  locale: Locale;
  value: string;
  expectedPublicationRevision: number | null;
  expectedDraftVersion: number;
}

const knownKeys = new Set<string>(Object.keys(catalogues.is));
const localeValues = new Set<string>(['is', 'en']);
const revisionKinds = new Set<string>([
  'inventory_sync',
  'publish',
  'restore',
  'source_ready',
  'draft_restore'
]);

export async function loadTranslationWorkspace(
  client: TranslationRpcClient,
  databaseSecret: string,
  requestId: string,
  commandIssuedAt = currentCommandTimestamp()
): Promise<TranslationWorkspaceResult<TranslationWorkspace>> {
  const proof = await createReadWorkspaceProof(
    { requestId, issuedAt: commandIssuedAt },
    databaseSecret
  );
  const response = await callTranslationRpc(
    client,
    'get_interface_translation_workspace',
    {},
    requestId,
    commandIssuedAt,
    proof.signature
  );
  if (response.status !== 'success') return response;
  if (!isTranslationWorkspace(response.data)) return { status: 'infrastructure_error' };
  return { status: 'success', value: response.data };
}

export async function saveTranslationDraft(
  client: TranslationRpcClient,
  databaseSecret: string,
  command: SaveTranslationDraftCommand,
  requestId: string,
  commandIssuedAt = currentCommandTimestamp()
): Promise<TranslationWorkspaceResult<SavedTranslationDraft>> {
  if (
    !knownKeys.has(command.key) ||
    !localeValues.has(command.locale) ||
    typeof command.value !== 'string' ||
    command.value.length > TRANSLATION_VALUE_MAX_LENGTH ||
    !isNullableRevision(command.expectedPublicationRevision) ||
    !isNonnegativeInteger(command.expectedDraftVersion)
  ) {
    return { status: 'infrastructure_error' };
  }

  const proof = await createSaveDraftProof(
    {
      requestId,
      issuedAt: commandIssuedAt,
      key: command.key,
      locale: command.locale,
      value: command.value,
      expectedPublicationRevision: command.expectedPublicationRevision,
      expectedDraftVersion: command.expectedDraftVersion
    },
    databaseSecret
  );
  const response = await callTranslationRpc(
    client,
    'save_interface_translation_draft',
    {
      requested_key: command.key,
      requested_locale: command.locale,
      requested_value: command.value,
      expected_publication_revision: command.expectedPublicationRevision,
      expected_draft_version: command.expectedDraftVersion
    },
    requestId,
    commandIssuedAt,
    proof.signature
  );
  if (response.status !== 'success') return response;
  const row = singleRecord(response.data);
  if (
    !row ||
    !isNonnegativeInteger(row.draft_version) ||
    !isNonnegativeInteger(row.pending_count)
  ) {
    return { status: 'infrastructure_error' };
  }
  return {
    status: 'success',
    value: {
      key: command.key as MessageKey,
      locale: command.locale,
      value: command.value,
      version: row.draft_version,
      changed: row.draft_version > 0,
      pendingCount: row.pending_count,
      currentRevision: command.expectedPublicationRevision
    }
  };
}

export async function readyTranslationDraftsForSource(
  client: TranslationRpcClient,
  databaseSecret: string,
  expectedPublicationRevision: number | null,
  expectedDraftGeneration: number,
  requestId: string,
  commandIssuedAt = currentCommandTimestamp()
): Promise<TranslationWorkspaceResult<ReadyTranslationSource>> {
  if (
    !isNullableRevision(expectedPublicationRevision) ||
    !isNonnegativeInteger(expectedDraftGeneration)
  ) {
    return { status: 'infrastructure_error' };
  }
  const proof = await createReadySourceProof(
    {
      requestId,
      issuedAt: commandIssuedAt,
      expectedPublicationRevision,
      expectedDraftGeneration
    },
    databaseSecret
  );
  const response = await callTranslationRpc(
    client,
    'ready_interface_translation_drafts_for_source',
    {
      expected_publication_revision: expectedPublicationRevision,
      expected_draft_generation: expectedDraftGeneration
    },
    requestId,
    commandIssuedAt,
    proof.signature
  );
  if (response.status !== 'success') return response;
  const row = singleRecord(response.data);
  if (
    !row ||
    !isPositiveInteger(row.revision_number) ||
    !isTimestamp(row.ready_at) ||
    !isNonnegativeInteger(row.change_count)
  ) {
    return { status: 'infrastructure_error' };
  }
  return {
    status: 'success',
    value: {
      revisionNumber: row.revision_number,
      readyAt: row.ready_at,
      changeCount: row.change_count
    }
  };
}

export async function restoreTranslationRevisionToDrafts(
  client: TranslationRpcClient,
  databaseSecret: string,
  targetRevisionNumber: number,
  expectedPublicationRevision: number,
  requestId: string,
  commandIssuedAt = currentCommandTimestamp()
): Promise<TranslationWorkspaceResult<RestoredTranslationDrafts>> {
  if (!isPositiveInteger(targetRevisionNumber) || !isPositiveInteger(expectedPublicationRevision)) {
    return { status: 'infrastructure_error' };
  }
  const proof = await createRestoreToDraftsProof(
    {
      requestId,
      issuedAt: commandIssuedAt,
      targetRevisionNumber,
      expectedPublicationRevision
    },
    databaseSecret
  );
  const response = await callTranslationRpc(
    client,
    'restore_interface_translation_revision_to_drafts',
    {
      requested_revision_number: targetRevisionNumber,
      expected_current_revision_number: expectedPublicationRevision
    },
    requestId,
    commandIssuedAt,
    proof.signature
  );
  if (response.status !== 'success') return response;
  const row = singleRecord(response.data);
  if (
    !row ||
    !isPositiveInteger(row.revision_number) ||
    !isTimestamp(row.restored_at) ||
    !isNonnegativeInteger(row.pending_count)
  ) {
    return { status: 'infrastructure_error' };
  }
  return {
    status: 'success',
    value: {
      revisionNumber: row.revision_number,
      restoredAt: row.restored_at,
      pendingCount: row.pending_count
    }
  };
}

async function callTranslationRpc(
  client: TranslationRpcClient,
  functionName: string,
  args: Record<string, unknown>,
  requestId: string,
  commandIssuedAt: number,
  commandProof: string
): Promise<
  { status: 'success'; data: unknown } | { status: 'conflict' } | { status: 'infrastructure_error' }
> {
  try {
    const { data, error } = await client.rpc(functionName, {
      ...args,
      command_request_id: requestId,
      command_issued_at: commandIssuedAt,
      command_proof: commandProof
    });
    if (error) {
      return error.code === '40001' || error.code === '55000'
        ? { status: 'conflict' }
        : { status: 'infrastructure_error' };
    }
    return { status: 'success', data };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function isTranslationWorkspace(value: unknown): value is TranslationWorkspace {
  if (!isRecord(value)) return false;
  if (!isNullableRevision(value.currentRevision)) return false;
  if (!(value.publishedAt === null || isTimestamp(value.publishedAt))) return false;
  if (!isNonnegativeInteger(value.draftGeneration)) return false;
  if (!isNonnegativeInteger(value.pendingCount)) return false;
  if (!(value.sourceCandidate === null || isTranslationSourceCandidate(value.sourceCandidate))) {
    return false;
  }
  if (!Array.isArray(value.entries) || !Array.isArray(value.revisions)) return false;

  const keys = new Set<string>();
  for (const entry of value.entries) {
    if (!isTranslationWorkspaceEntry(entry) || keys.has(entry.key)) return false;
    keys.add(entry.key);
  }
  return value.revisions.every(isTranslationRevision);
}

function isTranslationWorkspaceEntry(value: unknown): value is TranslationWorkspaceEntry {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    knownKeys.has(value.key) &&
    typeof value.namespace === 'string' &&
    value.namespace.length > 0 &&
    isLocaleStringRecord(value.published) &&
    isLocaleStringRecord(value.draft) &&
    isLocaleNumberRecord(value.versions) &&
    isLocaleBooleanRecord(value.changed)
  );
}

function isTranslationSourceCandidate(value: unknown): value is TranslationSourceCandidate {
  return (
    isRecord(value) &&
    isPositiveInteger(value.revisionNumber) &&
    isTimestamp(value.readyAt) &&
    isNonnegativeInteger(value.changeCount) &&
    (value.status === 'ready' || value.status === 'applied' || value.status === 'superseded')
  );
}

function isTranslationRevision(value: unknown): value is TranslationRevision {
  return (
    isRecord(value) &&
    isPositiveInteger(value.revisionNumber) &&
    typeof value.kind === 'string' &&
    revisionKinds.has(value.kind) &&
    isNonnegativeInteger(value.changeCount) &&
    isTimestamp(value.publishedAt) &&
    (value.restoredFromRevisionNumber === null ||
      isPositiveInteger(value.restoredFromRevisionNumber))
  );
}

function singleRecord(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && value.length === 1 && isRecord(value[0]) ? value[0] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLocaleStringRecord(value: unknown): value is Record<Locale, string> {
  return (
    isRecord(value) &&
    typeof value.is === 'string' &&
    value.is.length <= TRANSLATION_VALUE_MAX_LENGTH &&
    typeof value.en === 'string' &&
    value.en.length <= TRANSLATION_VALUE_MAX_LENGTH
  );
}

function isLocaleNumberRecord(value: unknown): value is Record<Locale, number> {
  return isRecord(value) && isNonnegativeInteger(value.is) && isNonnegativeInteger(value.en);
}

function isLocaleBooleanRecord(value: unknown): value is Record<Locale, boolean> {
  return isRecord(value) && typeof value.is === 'boolean' && typeof value.en === 'boolean';
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function isNullableRevision(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function currentCommandTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}
