export interface TranslationDatabaseProof {
  message: string;
  signature: string;
}

interface BaseProofInput {
  requestId: string;
  issuedAt: number;
}

interface SaveProofInput extends BaseProofInput {
  key: string;
  locale: 'is' | 'en';
  value: string;
  expectedPublicationRevision: number | null;
  expectedDraftVersion: number;
}

interface PublishProofInput extends BaseProofInput {
  expectedPublicationRevision: number | null;
  expectedDraftGeneration: number;
}

interface RestoreProofInput extends BaseProofInput {
  targetRevisionNumber: number;
  expectedPublicationRevision: number | null;
}

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createReadWorkspaceProof(
  input: BaseProofInput,
  secret: string
): Promise<TranslationDatabaseProof> {
  validateBaseInput(input, secret);
  return sign(
    `interface-translations-v2:read_workspace:${input.requestId}:${input.issuedAt}`,
    secret
  );
}

export async function createSaveDraftProof(
  input: SaveProofInput,
  secret: string
): Promise<TranslationDatabaseProof> {
  validateBaseInput(input, secret);
  const valueDigest = await sha256HexUtf8(input.value);
  return sign(
    `interface-translations-v2:save_draft:${input.requestId}:${input.issuedAt}:${input.key}:${input.locale}:${input.expectedPublicationRevision ?? 0}:${input.expectedDraftVersion}:${valueDigest}`,
    secret
  );
}

export async function createPublishProof(
  input: PublishProofInput,
  secret: string
): Promise<TranslationDatabaseProof> {
  validateBaseInput(input, secret);
  return sign(
    `interface-translations-v2:publish:${input.requestId}:${input.issuedAt}:${input.expectedPublicationRevision ?? 0}:${input.expectedDraftGeneration}`,
    secret
  );
}

export async function createRestoreProof(
  input: RestoreProofInput,
  secret: string
): Promise<TranslationDatabaseProof> {
  validateBaseInput(input, secret);
  return sign(
    `interface-translations-v2:restore:${input.requestId}:${input.issuedAt}:${input.targetRevisionNumber}:${input.expectedPublicationRevision ?? 0}`,
    secret
  );
}

export async function sha256HexUtf8(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateBaseInput(input: BaseProofInput, secret: string): void {
  if (!requestIdPattern.test(input.requestId)) {
    throw new Error('A valid request ID is required for a translation database proof.');
  }
  if (!Number.isSafeInteger(input.issuedAt) || input.issuedAt <= 0) {
    throw new Error('A valid issue timestamp is required for a translation database proof.');
  }
  if (!secret) {
    throw new Error('A database secret is required for a translation database proof.');
  }
}

async function sign(message: string, secret: string): Promise<TranslationDatabaseProof> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const signature = [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return { message, signature };
}
