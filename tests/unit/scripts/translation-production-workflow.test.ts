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
    const migrationIndex = workflow.indexOf('pnpm exec supabase db push --db-url');
    const inventoryApplyIndex = workflow.indexOf('-v release_sha="${RELEASE_SHA}"');
    const deployIndex = workflow.indexOf('Deploy the exact SHA to production');
    const smokeIndex = workflow.indexOf('data-translation-workspace-sign-in');

    expect(syncIndex).toBeGreaterThan(0);
    expect(syncIndex).toBeLessThan(migrationIndex);
    expect(inventoryApplyIndex).toBeGreaterThan(migrationIndex);
    expect(workflow).toContain('-f "${translation_sql}"');
    expect(workflow.match(/supabase db push[^\n]+--include-all/g)).toHaveLength(2);
    expect(workflow.match(/scripts\/sync-interface-translation-inventory\.ts/g)).toHaveLength(1);
    expect(deployIndex).toBeGreaterThan(syncIndex);
    expect(smokeIndex).toBeGreaterThan(deployIndex);
    expect(workflow).toContain('.checks.translations == "published"');
    expect(workflow).toContain('--expected-release "${RELEASE_SHA}"');
    expect(workflow).toContain('--expected-check translations=published');
    expect(workflow).toContain('.release == $release_sha');
    expect(workflow).not.toContain('-v translation_database_secret=');
    expect(workflow).not.toContain('hundavaent-translation-smoke-cookies.txt');
    expect(workflow).toContain('"${PRODUCTION_URL}/translations"');
    expect(workflow).toContain(
      'Translation workspace password boundary verified without changing translations.'
    );
  });

  it('keeps the previous capability valid until the deployed release is healthy', async () => {
    const workflow = await readFile('.github/workflows/production.yml', 'utf8');

    const deployIndex = workflow.indexOf('  deploy:');
    const healthIndex = workflow.indexOf('Verify production health and password gate');
    const finalizeIndex = workflow.indexOf('  finalize-translation-capability:');
    const retireIndex = workflow.indexOf('retire_previous_interface_translation_capability');

    expect(deployIndex).toBeGreaterThan(0);
    expect(healthIndex).toBeGreaterThan(deployIndex);
    expect(finalizeIndex).toBeGreaterThan(healthIndex);
    expect(retireIndex).toBeGreaterThan(finalizeIndex);
    expect(workflow).toContain('needs: deploy');
  });

  it('keeps preview translations explicitly unconfigured', async () => {
    const [previewWorkflow, wrangler] = await Promise.all([
      readFile('.github/workflows/preview.yml', 'utf8'),
      readFile('wrangler.toml', 'utf8')
    ]);

    expect(wrangler).not.toContain('TRANSLATION_WORKSPACE_PASSWORD');
    expect(wrangler).not.toContain('TRANSLATION_SESSION_SECRET');
    expect(wrangler).not.toContain('TRANSLATION_DATABASE_SECRET');
    expect(previewWorkflow).toContain('.checks.translations == "fallback"');
    expect(previewWorkflow).not.toContain('Interface translations: published');
  });
});
