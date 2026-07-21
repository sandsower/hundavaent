import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('production interface translation release contract', () => {
  it('reuses the site password and requires only separate session and database secrets', async () => {
    const workflow = await readFile('.github/workflows/production.yml', 'utf8');

    expect(workflow).toContain(
      'TRANSLATION_WORKSPACE_PASSWORD: ${{ secrets.HUNDAVAENT_PRODUCTION_SITE_GATE_PASSWORD }}'
    );
    expect(workflow).toContain(
      'TRANSLATION_SESSION_SECRET: ${{ secrets.HUNDAVAENT_PRODUCTION_TRANSLATION_SESSION_SECRET }}'
    );
    expect(workflow).toContain(
      'TRANSLATION_DATABASE_SECRET: ${{ secrets.HUNDAVAENT_PRODUCTION_TRANSLATION_DATABASE_SECRET }}'
    );
    expect(workflow).not.toContain('HUNDAVAENT_PRODUCTION_TRANSLATION_WORKSPACE_PASSWORD');
  });

  it('syncs and verifies inventory before the non-mutating workspace smoke', async () => {
    const workflow = await readFile('.github/workflows/production.yml', 'utf8');

    const syncIndex = workflow.indexOf('scripts/sync-interface-translation-inventory.ts');
    const deployIndex = workflow.indexOf('Deploy the exact SHA to production');
    const smokeIndex = workflow.indexOf('data-translation-workspace-sign-in');

    expect(syncIndex).toBeGreaterThan(0);
    expect(deployIndex).toBeGreaterThan(syncIndex);
    expect(smokeIndex).toBeGreaterThan(deployIndex);
    expect(workflow).toContain('.checks.translations == "published"');
    expect(workflow).not.toContain('-v translation_database_secret=');
    expect(workflow).not.toContain('hundavaent-translation-smoke-cookies.txt');
    expect(workflow).toContain('"${PRODUCTION_URL}/translations"');
    expect(workflow).toContain(
      'Translation workspace password boundary verified without changing translations.'
    );
  });
});
