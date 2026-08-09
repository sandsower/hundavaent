import { describe, expect, it, vi } from 'vitest';

import {
  TRANSLATION_COOKIE_NAME,
  createTranslationSession,
  getTranslationAccessConfig,
  isTranslationSessionValid,
  normalizeTranslationRedirectTo,
  translationCookieOptions,
  verifyTranslationPassword
} from '$server/translations/access';
import {
  TRANSLATION_MAX_FAILED_ATTEMPTS,
  TranslationAttemptThrottle,
  translationClientKey
} from '$server/translations/attempts';
import {
  createReadSourceCandidateProof,
  createReadWorkspaceProof,
  createReadySourceProof,
  createRestoreToDraftsProof,
  createSaveDraftProof
} from '$server/translations/proof';
import {
  loadTranslationWorkspace,
  readyTranslationDraftsForSource,
  restoreTranslationRevisionToDrafts,
  saveTranslationDraft
} from '$server/translations/workspace';

const config = {
  password: 'shared-password',
  sessionSecret: 'session-secret-with-enough-entropy',
  databaseSecret: 'database-secret-with-enough-entropy'
};

describe('translation workspace access', () => {
  it('requires all three private values', () => {
    expect(
      getTranslationAccessConfig({
        TRANSLATION_WORKSPACE_PASSWORD: ' shared-password ',
        TRANSLATION_SESSION_SECRET: ' session-secret ',
        TRANSLATION_DATABASE_SECRET: ' database-secret '
      })
    ).toEqual({
      password: 'shared-password',
      sessionSecret: 'session-secret',
      databaseSecret: 'database-secret'
    });
    expect(getTranslationAccessConfig({ TRANSLATION_WORKSPACE_PASSWORD: 'password' })).toBeNull();
  });

  it('verifies the password without exposing it in the session value', async () => {
    await expect(verifyTranslationPassword('shared-password', config)).resolves.toBe(true);
    await expect(verifyTranslationPassword('wrong-password', config)).resolves.toBe(false);

    const value = await createTranslationSession(config, new Date('2026-07-21T12:00:00Z'));
    expect(value).toMatch(/^v1\.\d+\.[0-9a-f]{64}$/);
    expect(value).not.toContain(config.password);
  });

  it('accepts an unexpired signed session and rejects expiry, tampering, and rotation', async () => {
    const issuedAt = new Date('2026-07-21T12:00:00Z');
    const value = await createTranslationSession(config, issuedAt);

    await expect(
      isTranslationSessionValid(value, config, new Date('2026-07-22T12:00:00Z'))
    ).resolves.toBe(true);
    await expect(
      isTranslationSessionValid(value, config, new Date('2026-08-22T12:00:00Z'))
    ).resolves.toBe(false);
    await expect(
      isTranslationSessionValid(`${value}0`, config, new Date('2026-07-22T12:00:00Z'))
    ).resolves.toBe(false);
    await expect(
      isTranslationSessionValid(
        value,
        { ...config, sessionSecret: 'rotated-secret' },
        new Date('2026-07-22T12:00:00Z')
      )
    ).resolves.toBe(false);
  });

  it('keeps redirects inside the translation workspace', () => {
    expect(TRANSLATION_COOKIE_NAME).toBe('hundavaent-translations');
    expect(normalizeTranslationRedirectTo('/translations/review?from=editor')).toBe(
      '/translations/review?from=editor'
    );
    expect(normalizeTranslationRedirectTo('/en')).toBe('/translations');
    expect(normalizeTranslationRedirectTo('//attacker.example/translations')).toBe('/translations');
    expect(normalizeTranslationRedirectTo('/translations/sign-in')).toBe('/translations');
    expect(normalizeTranslationRedirectTo('/translations-evil')).toBe('/translations');
  });

  it('scopes the HttpOnly cookie to translations and secures it on HTTPS', () => {
    expect(translationCookieOptions(new URL('https://hundavaent.is/translations'))).toMatchObject({
      path: '/translations',
      httpOnly: true,
      sameSite: 'strict',
      secure: true
    });
    expect(translationCookieOptions(new URL('http://localhost:5173/translations')).secure).toBe(
      false
    );
  });
});

describe('translation password throttling', () => {
  it('blocks the fifth failed attempt for fifteen minutes and clears on success', () => {
    let now = 1_000;
    const throttle = new TranslationAttemptThrottle(() => now);
    for (let attempt = 1; attempt < TRANSLATION_MAX_FAILED_ATTEMPTS; attempt += 1) {
      expect(throttle.recordFailure('198.51.100.7').blocked).toBe(false);
    }
    expect(throttle.recordFailure('198.51.100.7')).toEqual({
      blocked: true,
      retryAfterSeconds: 900
    });
    now += 899_000;
    expect(throttle.check('198.51.100.7').blocked).toBe(true);
    throttle.clear('198.51.100.7');
    expect(throttle.check('198.51.100.7').blocked).toBe(false);
  });

  it('uses the trusted Cloudflare client address with a bounded fallback', () => {
    expect(translationClientKey(new Headers({ 'cf-connecting-ip': ' 198.51.100.9 ' }))).toBe(
      '198.51.100.9'
    );
    expect(translationClientKey(new Headers())).toBe('unknown');
  });
});

describe('translation database proof', () => {
  const requestId = '11111111-1111-4111-8111-111111111111';
  const issuedAt = 1_753_099_200;

  it('binds workspace, source readiness, candidate reads, and draft restores to distinct commands', async () => {
    await expect(
      createReadWorkspaceProof({ requestId, issuedAt }, 'database-secret')
    ).resolves.toMatchObject({
      message:
        'interface-translations-v2:read_workspace:11111111-1111-4111-8111-111111111111:1753099200'
    });
    await expect(
      createReadySourceProof(
        {
          requestId,
          issuedAt,
          expectedPublicationRevision: 4,
          expectedDraftGeneration: 9
        },
        'database-secret'
      )
    ).resolves.toMatchObject({
      message:
        'interface-translations-v3:ready_source:11111111-1111-4111-8111-111111111111:1753099200:4:9'
    });
    await expect(
      createReadSourceCandidateProof({ requestId, issuedAt }, 'database-secret')
    ).resolves.toMatchObject({
      message:
        'interface-translations-v3:read_source_candidate:11111111-1111-4111-8111-111111111111:1753099200'
    });
    await expect(
      createRestoreToDraftsProof(
        { requestId, issuedAt, targetRevisionNumber: 2, expectedPublicationRevision: 4 },
        'database-secret'
      )
    ).resolves.toMatchObject({
      message:
        'interface-translations-v3:restore_to_drafts:11111111-1111-4111-8111-111111111111:1753099200:2:4'
    });
  });

  it('binds a save proof to time, key, locale, versions, and the value digest', async () => {
    const proof = await createSaveDraftProof(
      {
        requestId: '11111111-1111-4111-8111-111111111111',
        issuedAt: 1_753_099_200,
        key: 'site.name',
        locale: 'en',
        value: 'Dog friendly',
        expectedPublicationRevision: 4,
        expectedDraftVersion: 2
      },
      'database-secret'
    );

    expect(proof.message).toBe(
      'interface-translations-v2:save_draft:11111111-1111-4111-8111-111111111111:1753099200:site.name:en:4:2:10d7d240cb7170a71a3098c48b1b6540075cfa409466b17a7b1301a05b879933'
    );
    expect(proof.signature).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      createSaveDraftProof(
        {
          requestId: 'not-a-request-id',
          issuedAt: 1_753_099_200,
          key: 'site.name',
          locale: 'en',
          value: 'Dog friendly',
          expectedPublicationRevision: 4,
          expectedDraftVersion: 2
        },
        'database-secret'
      )
    ).rejects.toThrow('request ID');
  });
});

describe('translation workspace RPC adapter', () => {
  const workspace = {
    currentRevision: 4,
    publishedAt: '2026-07-21T12:00:00Z',
    draftGeneration: 9,
    pendingCount: 1,
    sourceCandidate: null,
    entries: [
      {
        key: 'site.name',
        namespace: 'site',
        published: { is: 'Hundavænt', en: 'Dog Friendly' },
        draft: { is: 'Hundavænt', en: 'Dog friendly' },
        versions: { is: 0, en: 2 },
        changed: { is: false, en: true }
      }
    ],
    revisions: [
      {
        revisionNumber: 4,
        kind: 'publish',
        changeCount: 1,
        publishedAt: '2026-07-21T12:00:00Z',
        restoredFromRevisionNumber: null
      }
    ]
  } as const;

  it('loads and validates the workspace through the narrow RPC interface', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: workspace, error: null });

    await expect(
      loadTranslationWorkspace(
        { rpc },
        config.databaseSecret,
        '11111111-1111-4111-8111-111111111111',
        1_753_099_200
      )
    ).resolves.toEqual({ status: 'success', value: workspace });
    expect(rpc).toHaveBeenCalledWith('get_interface_translation_workspace', {
      command_request_id: '11111111-1111-4111-8111-111111111111',
      command_issued_at: 1_753_099_200,
      command_proof: expect.stringMatching(/^[0-9a-f]{64}$/)
    });
  });

  it('rejects malformed workspace data', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...workspace, entries: [{ ...workspace.entries[0], key: '../unknown' }] },
      error: null
    });

    await expect(
      loadTranslationWorkspace(
        { rpc },
        config.databaseSecret,
        '11111111-1111-4111-8111-111111111111',
        1_753_099_200
      )
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });

  it('saves one locale with optimistic concurrency', async () => {
    const saved = {
      key: 'site.name',
      locale: 'en',
      value: 'Dog friendly',
      version: 3,
      changed: true,
      pendingCount: 1,
      currentRevision: 4
    } as const;
    const rpc = vi.fn().mockResolvedValue({
      data: [{ draft_version: 3, pending_count: 1 }],
      error: null
    });

    await expect(
      saveTranslationDraft(
        { rpc },
        config.databaseSecret,
        {
          key: 'site.name',
          locale: 'en',
          value: 'Dog friendly',
          expectedPublicationRevision: 4,
          expectedDraftVersion: 2
        },
        '11111111-1111-4111-8111-111111111111',
        1_753_099_200
      )
    ).resolves.toEqual({ status: 'success', value: saved });
    expect(rpc).toHaveBeenCalledWith('save_interface_translation_draft', {
      requested_key: 'site.name',
      requested_locale: 'en',
      requested_value: 'Dog friendly',
      expected_publication_revision: 4,
      expected_draft_version: 2,
      command_request_id: '11111111-1111-4111-8111-111111111111',
      command_issued_at: 1_753_099_200,
      command_proof: expect.stringMatching(/^[0-9a-f]{64}$/)
    });
  });

  it('enforces the 10,000 character adapter boundary before any RPC', async () => {
    const rpc = vi.fn();
    await expect(
      saveTranslationDraft(
        { rpc },
        config.databaseSecret,
        {
          key: 'site.name',
          locale: 'en',
          value: 'x'.repeat(10_001),
          expectedPublicationRevision: 4,
          expectedDraftVersion: 2
        },
        '11111111-1111-4111-8111-111111111111',
        1_753_099_200
      )
    ).resolves.toEqual({ status: 'infrastructure_error' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps stale saves and source readiness to conflicts', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '40001' } });

    await expect(
      saveTranslationDraft(
        { rpc },
        config.databaseSecret,
        {
          key: 'site.name',
          locale: 'is',
          value: 'Hundavænt',
          expectedPublicationRevision: 4,
          expectedDraftVersion: 0
        },
        '11111111-1111-4111-8111-111111111111',
        1_753_099_200
      )
    ).resolves.toEqual({ status: 'conflict' });
    await expect(
      readyTranslationDraftsForSource(
        { rpc },
        config.databaseSecret,
        4,
        9,
        '11111111-1111-4111-8111-111111111111',
        1_753_099_200
      )
    ).resolves.toEqual({ status: 'conflict' });
  });

  it('readies source candidates and restores history to drafts through operation-specific proofs', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            revision_number: 5,
            ready_at: '2026-07-21T13:00:00Z',
            change_count: 1
          }
        ],
        error: null
      })
      .mockResolvedValueOnce({
        data: [
          {
            revision_number: 6,
            restored_at: '2026-07-21T14:00:00Z',
            pending_count: 2
          }
        ],
        error: null
      });

    await expect(
      readyTranslationDraftsForSource(
        { rpc },
        config.databaseSecret,
        4,
        9,
        '11111111-1111-4111-8111-111111111111',
        1_753_099_200
      )
    ).resolves.toEqual({
      status: 'success',
      value: { revisionNumber: 5, readyAt: '2026-07-21T13:00:00Z', changeCount: 1 }
    });
    expect(rpc).toHaveBeenLastCalledWith('ready_interface_translation_drafts_for_source', {
      expected_publication_revision: 4,
      expected_draft_generation: 9,
      command_request_id: '11111111-1111-4111-8111-111111111111',
      command_issued_at: 1_753_099_200,
      command_proof: expect.stringMatching(/^[0-9a-f]{64}$/)
    });

    await expect(
      restoreTranslationRevisionToDrafts(
        { rpc },
        config.databaseSecret,
        2,
        5,
        '11111111-1111-4111-8111-111111111111',
        1_753_099_200
      )
    ).resolves.toEqual({
      status: 'success',
      value: { revisionNumber: 6, restoredAt: '2026-07-21T14:00:00Z', pendingCount: 2 }
    });
    expect(rpc).toHaveBeenLastCalledWith('restore_interface_translation_revision_to_drafts', {
      requested_revision_number: 2,
      expected_current_revision_number: 5,
      command_request_id: '11111111-1111-4111-8111-111111111111',
      command_issued_at: 1_753_099_200,
      command_proof: expect.stringMatching(/^[0-9a-f]{64}$/)
    });
  });
});
