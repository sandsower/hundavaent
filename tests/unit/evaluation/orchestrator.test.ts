import { describe, expect, it } from 'vitest';

import { validateEvidenceManifest } from '$server/evaluation/evidence';
import {
  assembleEvidenceManifest,
  getManagedServerEnvironment,
  getSupabaseAuthHealthUrl
} from '../../../scripts/evaluate-release';

describe('release evaluation orchestration', () => {
  it('starts the managed browser server with the complete local Member auth contract', () => {
    expect(
      getManagedServerEnvironment(
        {
          apiUrl: 'http://127.0.0.1:54321',
          publishableKey: 'local-publishable-key'
        },
        { PATH: '/usr/bin' }
      )
    ).toMatchObject({
      PATH: '/usr/bin',
      EVALUATION_MANAGED_SERVER: '1',
      PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-publishable-key',
      PUBLIC_APP_URL: 'http://127.0.0.1:4173',
      AUTH_EMAIL_ENABLED: 'true',
      AUTH_FACEBOOK_ENABLED: 'false',
      MEMBER_ACTIVATION_SECRET: 'local-member-activation-capability-secret-v1'
    });
  });

  it('waits on the local Auth service after a visual database reset', () => {
    expect(getSupabaseAuthHealthUrl({ apiUrl: 'http://127.0.0.1:54321' })).toBe(
      'http://127.0.0.1:54321/auth/v1/health'
    );
  });

  it('emits an explicit failing manifest when required stages and evidence are missing', () => {
    const manifest = assembleEvidenceManifest({
      stageResults: [],
      testEvidence: [],
      commitSha: 'abc1234',
      generatedAt: '2026-07-09T12:00:00.000Z'
    });

    expect(manifest.verdict.status).toBe('fail');
    expect(manifest.verdict.failures).toEqual(
      expect.arrayContaining([
        'accessibility evidence is missing',
        'Icelandic visual evidence is incomplete',
        'English visual evidence is incomplete',
        'performance evidence is missing',
        'scenario failed or lacks evidence: moderator-candidate-creation'
      ])
    );
    expect(validateEvidenceManifest(manifest).valid).toBe(false);
  });
});
