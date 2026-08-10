export type TranslationAccessRole = 'translator' | 'translation_owner';
export type TranslationPackageStatus =
  'draft' | 'submitted' | 'revision_requested' | 'approved' | 'exported' | 'discarded';

export interface TranslationActor {
  id: string;
  label: string;
}

export interface TranslationAccess {
  role: TranslationAccessRole;
  canTranslate: true;
  canReview: boolean;
  actor: TranslationActor;
}

export interface TranslationPackageEntry {
  key: string;
  baseline: { is: string; en: string };
  draft: { is: string; en: string };
  version: number;
  changedBy: string;
  changedAt: string;
  complete: boolean;
}

export interface TranslationPackage {
  id: string;
  pageId: string;
  contextPath: string;
  baseRevision: number;
  status: TranslationPackageStatus;
  version: number;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  exportedAt: string | null;
  candidateRevision: number | null;
  author: TranslationActor;
  reviewer: TranslationActor | null;
  entries: TranslationPackageEntry[];
}

export interface TranslationApprovedHistory {
  key: string;
  changedBy: string;
  changedAt: string;
  approvedBy: string;
  approvedAt: string;
  exportedAt: string | null;
  complete: boolean;
}

export interface TranslationWorkspace {
  access: TranslationAccess;
  pageId: string;
  currentRevision: number;
  activePackage: TranslationPackage | null;
  approvedHistory: TranslationApprovedHistory[];
}

export interface TranslationReviewSummary {
  id: string;
  pageId: string;
  contextPath: string;
  status: 'submitted';
  version: number;
  submittedAt: string;
  author: string;
  changeCount: number;
}

export interface SavedTranslationPackageEntry {
  packageId: string;
  key: string;
  entryVersion: number;
  packageVersion: number;
  changed: boolean;
  changedBy: string;
  changedAt: string;
}

export interface TranslationPackageRpcClient {
  rpc(
    functionName: string,
    args?: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}

export type TranslationPackageResult<T> =
  | { status: 'success'; value: T }
  | { status: 'conflict' }
  | { status: 'forbidden' }
  | { status: 'invalid_state' }
  | { status: 'infrastructure_error' };

export type TranslationAccessResult =
  | { status: 'success'; value: TranslationAccess }
  | { status: 'none' }
  | { status: 'infrastructure_error' };

export async function getTranslationAccess(
  client: TranslationPackageRpcClient
): Promise<TranslationAccessResult> {
  try {
    const { data, error } = await client.rpc('get_my_interface_translation_access');
    if (error) return { status: 'infrastructure_error' };
    if (data === null) return { status: 'none' };
    return isTranslationAccess(data)
      ? { status: 'success', value: data }
      : { status: 'infrastructure_error' };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function loadTranslationWorkspace(
  client: TranslationPackageRpcClient,
  pageId: string
): Promise<TranslationPackageResult<TranslationWorkspace>> {
  const response = await call(client, 'get_my_interface_translation_workspace', {
    requested_page_id: pageId
  });
  if (response.status !== 'success') return response;
  return isTranslationWorkspace(response.data)
    ? { status: 'success', value: response.data }
    : { status: 'infrastructure_error' };
}

export async function loadTranslationPackage(
  client: TranslationPackageRpcClient,
  packageId: string
): Promise<TranslationPackageResult<TranslationPackage>> {
  const response = await call(client, 'get_my_interface_translation_package', {
    requested_package_id: packageId
  });
  if (response.status !== 'success') return response;
  return isTranslationPackage(response.data)
    ? { status: 'success', value: response.data }
    : { status: 'infrastructure_error' };
}

export async function listTranslationReviewPackages(
  client: TranslationPackageRpcClient
): Promise<TranslationPackageResult<TranslationReviewSummary[]>> {
  const response = await call(client, 'list_interface_translation_review_packages');
  if (response.status !== 'success') return response;
  return Array.isArray(response.data) && response.data.every(isTranslationReviewSummary)
    ? { status: 'success', value: response.data }
    : { status: 'infrastructure_error' };
}

export async function startTranslationPackage(
  client: TranslationPackageRpcClient,
  command: { pageId: string; contextPath: string; requestId: string }
): Promise<TranslationPackageResult<TranslationPackage>> {
  return packageCommand(client, 'start_interface_translation_package', {
    requested_page_id: command.pageId,
    requested_context_path: command.contextPath,
    command_request_id: command.requestId
  });
}

export async function saveTranslationPackageEntry(
  client: TranslationPackageRpcClient,
  command: {
    packageId: string;
    key: string;
    valueIs: string;
    valueEn: string;
    expectedEntryVersion: number;
    requestId: string;
  }
): Promise<TranslationPackageResult<SavedTranslationPackageEntry>> {
  const response = await call(client, 'save_interface_translation_package_entry', {
    requested_package_id: command.packageId,
    requested_key: command.key,
    requested_value_is: command.valueIs,
    requested_value_en: command.valueEn,
    expected_entry_version: command.expectedEntryVersion,
    command_request_id: command.requestId
  });
  if (response.status !== 'success') return response;
  return isSavedTranslationPackageEntry(response.data)
    ? { status: 'success', value: response.data }
    : { status: 'infrastructure_error' };
}

export async function submitTranslationPackage(
  client: TranslationPackageRpcClient,
  command: { packageId: string; expectedPackageVersion: number; requestId: string }
): Promise<TranslationPackageResult<TranslationPackage>> {
  return packageCommand(client, 'submit_interface_translation_package', {
    requested_package_id: command.packageId,
    expected_package_version: command.expectedPackageVersion,
    command_request_id: command.requestId
  });
}

export async function reviewTranslationPackage(
  client: TranslationPackageRpcClient,
  command: {
    packageId: string;
    decision: 'return' | 'approve';
    note: string | null;
    expectedPackageVersion: number;
    requestId: string;
  }
): Promise<TranslationPackageResult<TranslationPackage>> {
  return packageCommand(client, 'review_interface_translation_package', {
    requested_package_id: command.packageId,
    requested_decision: command.decision,
    requested_note: command.note,
    expected_package_version: command.expectedPackageVersion,
    command_request_id: command.requestId
  });
}

export async function discardTranslationPackage(
  client: TranslationPackageRpcClient,
  command: { packageId: string; expectedPackageVersion: number; requestId: string }
): Promise<TranslationPackageResult<TranslationPackage>> {
  return packageCommand(client, 'discard_interface_translation_package', {
    requested_package_id: command.packageId,
    expected_package_version: command.expectedPackageVersion,
    command_request_id: command.requestId
  });
}

async function packageCommand(
  client: TranslationPackageRpcClient,
  functionName: string,
  args: Record<string, unknown>
): Promise<TranslationPackageResult<TranslationPackage>> {
  const response = await call(client, functionName, args);
  if (response.status !== 'success') return response;
  return isTranslationPackage(response.data)
    ? { status: 'success', value: response.data }
    : { status: 'infrastructure_error' };
}

async function call(
  client: TranslationPackageRpcClient,
  functionName: string,
  args?: Record<string, unknown>
): Promise<
  | { status: 'success'; data: unknown }
  | { status: 'conflict' }
  | { status: 'forbidden' }
  | { status: 'invalid_state' }
  | { status: 'infrastructure_error' }
> {
  try {
    const { data, error } = await client.rpc(functionName, args);
    if (!error) return { status: 'success', data };
    if (error.code === '40001') return { status: 'conflict' };
    if (error.code === '42501') return { status: 'forbidden' };
    if (error.code === '22023' || error.code === '55000') return { status: 'invalid_state' };
    return { status: 'infrastructure_error' };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function isTranslationAccess(value: unknown): value is TranslationAccess {
  return (
    isRecord(value) &&
    (value.role === 'translator' || value.role === 'translation_owner') &&
    value.canTranslate === true &&
    typeof value.canReview === 'boolean' &&
    isTranslationActor(value.actor)
  );
}

function isTranslationWorkspace(value: unknown): value is TranslationWorkspace {
  return (
    isRecord(value) &&
    isTranslationAccess(value.access) &&
    typeof value.pageId === 'string' &&
    isPositiveInteger(value.currentRevision) &&
    (value.activePackage === null || isTranslationPackage(value.activePackage)) &&
    Array.isArray(value.approvedHistory) &&
    value.approvedHistory.every(isTranslationApprovedHistory)
  );
}

function isTranslationPackage(value: unknown): value is TranslationPackage {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.pageId === 'string' &&
    typeof value.contextPath === 'string' &&
    isPositiveInteger(value.baseRevision) &&
    isTranslationPackageStatus(value.status) &&
    isPositiveInteger(value.version) &&
    isNullableString(value.reviewNote) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    isNullableTimestamp(value.submittedAt) &&
    isNullableTimestamp(value.reviewedAt) &&
    isNullableTimestamp(value.approvedAt) &&
    isNullableTimestamp(value.exportedAt) &&
    (value.candidateRevision === null || isPositiveInteger(value.candidateRevision)) &&
    isTranslationActor(value.author) &&
    (value.reviewer === null || isTranslationActor(value.reviewer)) &&
    Array.isArray(value.entries) &&
    value.entries.every(isTranslationPackageEntry)
  );
}

function isTranslationPackageEntry(value: unknown): value is TranslationPackageEntry {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    isLocalePair(value.baseline) &&
    isLocalePair(value.draft) &&
    isPositiveInteger(value.version) &&
    typeof value.changedBy === 'string' &&
    isTimestamp(value.changedAt) &&
    typeof value.complete === 'boolean'
  );
}

function isTranslationApprovedHistory(value: unknown): value is TranslationApprovedHistory {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.changedBy === 'string' &&
    isTimestamp(value.changedAt) &&
    typeof value.approvedBy === 'string' &&
    isTimestamp(value.approvedAt) &&
    isNullableTimestamp(value.exportedAt) &&
    typeof value.complete === 'boolean'
  );
}

function isTranslationReviewSummary(value: unknown): value is TranslationReviewSummary {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.pageId === 'string' &&
    typeof value.contextPath === 'string' &&
    value.status === 'submitted' &&
    isPositiveInteger(value.version) &&
    isTimestamp(value.submittedAt) &&
    typeof value.author === 'string' &&
    Number.isInteger(value.changeCount) &&
    Number(value.changeCount) > 0
  );
}

function isSavedTranslationPackageEntry(value: unknown): value is SavedTranslationPackageEntry {
  return (
    isRecord(value) &&
    typeof value.packageId === 'string' &&
    typeof value.key === 'string' &&
    Number.isInteger(value.entryVersion) &&
    Number(value.entryVersion) >= 0 &&
    isPositiveInteger(value.packageVersion) &&
    typeof value.changed === 'boolean' &&
    typeof value.changedBy === 'string' &&
    isTimestamp(value.changedAt)
  );
}

function isTranslationActor(value: unknown): value is TranslationActor {
  return isRecord(value) && typeof value.id === 'string' && typeof value.label === 'string';
}

function isLocalePair(value: unknown): value is { is: string; en: string } {
  return isRecord(value) && typeof value.is === 'string' && typeof value.en === 'string';
}

function isTranslationPackageStatus(value: unknown): value is TranslationPackageStatus {
  return (
    value === 'draft' ||
    value === 'submitted' ||
    value === 'revision_requested' ||
    value === 'approved' ||
    value === 'exported' ||
    value === 'discarded'
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
