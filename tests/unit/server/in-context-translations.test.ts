import { describe, expect, it, vi } from 'vitest';

import {
  getTranslationAccess,
  loadTranslationPackage,
  loadTranslationWorkspace,
  saveTranslationPackageEntry,
  startTranslationPackage,
  submitTranslationPackage
} from '$server/translations/packages';

const access = {
  role: 'translation_owner',
  canTranslate: true,
  canReview: true,
  actor: { id: 'owner-id', label: 'owner@example.invalid' }
} as const;

const packageValue = {
  id: '6e1d6ca7-3d29-4533-af30-ab290f7c083b',
  pageId: '/about',
  contextPath: '/en/about',
  baseRevision: 4,
  status: 'draft',
  version: 1,
  reviewNote: null,
  createdAt: '2026-08-10T10:00:00.000Z',
  updatedAt: '2026-08-10T10:00:00.000Z',
  submittedAt: null,
  reviewedAt: null,
  approvedAt: null,
  exportedAt: null,
  candidateRevision: null,
  author: { id: 'translator-id', label: 'translator@example.invalid' },
  reviewer: null,
  entries: []
} as const;

function clientReturning(data: unknown, error: { code?: string } | null = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) };
}

describe('in-context translation RPC adapter', () => {
  it('returns no capability for an ordinary authenticated account', async () => {
    const client = clientReturning(null);

    await expect(getTranslationAccess(client)).resolves.toEqual({ status: 'none' });
    expect(client.rpc).toHaveBeenCalledWith('get_my_interface_translation_access');
  });

  it('parses owner capability without exposing any catalogue data', async () => {
    const client = clientReturning(access);

    await expect(getTranslationAccess(client)).resolves.toEqual({
      status: 'success',
      value: access
    });
  });

  it('loads only the caller workspace for the normalized page id', async () => {
    const workspace = {
      access,
      pageId: '/about',
      currentRevision: 4,
      activePackage: packageValue,
      approvedHistory: []
    };
    const client = clientReturning(workspace);

    await expect(loadTranslationWorkspace(client, '/about')).resolves.toEqual({
      status: 'success',
      value: workspace
    });
    expect(client.rpc).toHaveBeenCalledWith('get_my_interface_translation_workspace', {
      requested_page_id: '/about'
    });
  });

  it('starts a private page package with an idempotency request id', async () => {
    const client = clientReturning(packageValue);

    await expect(
      startTranslationPackage(client, {
        pageId: '/about',
        contextPath: '/en/about',
        requestId: 'start-request'
      })
    ).resolves.toEqual({ status: 'success', value: packageValue });
    expect(client.rpc).toHaveBeenCalledWith('start_interface_translation_package', {
      requested_page_id: '/about',
      requested_context_path: '/en/about',
      command_request_id: 'start-request'
    });
  });

  it('maps optimistic save conflicts without treating them as infrastructure failures', async () => {
    const client = clientReturning(null, { code: '40001' });

    await expect(
      saveTranslationPackageEntry(client, {
        packageId: packageValue.id,
        key: 'about.heroTitle',
        valueIs: 'Saman',
        valueEn: 'Together',
        expectedEntryVersion: 2,
        requestId: 'save-request'
      })
    ).resolves.toEqual({ status: 'conflict' });
  });

  it('returns the updated package projection after submit', async () => {
    const submitted = { ...packageValue, status: 'submitted', version: 2 } as const;
    const client = clientReturning(submitted);

    await expect(
      submitTranslationPackage(client, {
        packageId: packageValue.id,
        expectedPackageVersion: 1,
        requestId: 'submit-request'
      })
    ).resolves.toEqual({ status: 'success', value: submitted });
  });

  it('rejects malformed package projections from the database boundary', async () => {
    const client = clientReturning({ ...packageValue, entries: 'not-an-array' });

    await expect(loadTranslationPackage(client, packageValue.id)).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });
});
