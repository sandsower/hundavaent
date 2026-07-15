import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/202607150034_inline_ratings.sql'),
  'utf8'
);

describe('inline Rating migration safety contract', () => {
  it('fails closed when any pre-launch identity or pending Rating state exists', () => {
    const guard = migration.match(/do \$\$([\s\S]*?)\$\$;/)?.[1] ?? '';

    expect(guard).toContain('private.dog_friendliness_ratings');
    expect(guard).toContain('private.dog_friendliness_rating_events');
    expect(guard).toContain('private.member_accounts');
    expect(guard).toContain('private.auth_pending_intents');
    expect(guard).toContain('private.pending_member_rating_completions');
    expect(guard).toContain('auth.users');
    expect(guard).toContain('auth.identities');
  });
});
