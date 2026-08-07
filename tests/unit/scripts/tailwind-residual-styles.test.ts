import { describe, expect, it } from 'vitest';
import {
  digestStyleBlocks,
  validateResidualStyleInventory,
  type ResidualStyleEntry
} from '../../../scripts/check-tailwind-residual-styles';

const approved: ResidualStyleEntry = {
  path: 'src/lib/Example.svelte',
  sha256: digestStyleBlocks('<div></div><style>.example { animation: pulse 1s; }</style>')!,
  categories: ['animation']
};

describe('Tailwind residual-style guard', () => {
  it('accepts the exact reviewed residual block', () => {
    expect(
      validateResidualStyleInventory(
        [{ path: approved.path, sha256: approved.sha256, categories: ['animation'] }],
        [approved]
      )
    ).toEqual([]);
  });

  it('rejects a new scoped style outside the allowlist', () => {
    expect(
      validateResidualStyleInventory(
        [
          { path: approved.path, sha256: approved.sha256, categories: ['animation'] },
          {
            path: 'src/lib/NewStyle.svelte',
            sha256: 'new-style-digest',
            categories: ['cross-component']
          }
        ],
        [approved]
      )
    ).toEqual(['src/lib/NewStyle.svelte: contains an unapproved <style> block']);
  });

  it('rejects drift inside an approved style block', () => {
    expect(
      validateResidualStyleInventory(
        [{ path: approved.path, sha256: 'changed-digest', categories: ['animation'] }],
        [approved]
      )
    ).toEqual([
      'src/lib/Example.svelte: residual <style> content changed; review it and update the allowlist'
    ]);
  });

  it('rejects a category claim that the residual block does not support', () => {
    expect(
      validateResidualStyleInventory(
        [{ path: approved.path, sha256: approved.sha256, categories: ['animation'] }],
        [{ ...approved, categories: ['cross-component'] }]
      )
    ).toEqual([
      'src/lib/Example.svelte: recorded residual categories do not match the style block'
    ]);
  });

  it('rejects stale and uncategorized allowlist entries', () => {
    expect(validateResidualStyleInventory([], [{ ...approved, categories: [] }])).toEqual([
      'src/lib/Example.svelte: allowlist entry is stale because the residual <style> block is gone',
      'src/lib/Example.svelte: allowlist entry must record at least one residual category'
    ]);
  });
});
