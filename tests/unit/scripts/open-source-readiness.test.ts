import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  inspectTrackedContent,
  inspectTrackedPath,
  scanOpenSourceReadiness
} from '../../../scripts/check-open-source-readiness';

describe('open-source repository boundary', () => {
  it('rejects private source trees and environment files', () => {
    expect(inspectTrackedPath('plans/private-design.md')).toEqual([
      expect.objectContaining({ kind: 'forbidden-path' })
    ]);
    expect(inspectTrackedPath('research/venue-leads.md')).toEqual([
      expect.objectContaining({ kind: 'forbidden-path' })
    ]);
    expect(inspectTrackedPath('.env.production')).toEqual([
      expect.objectContaining({ kind: 'forbidden-path' })
    ]);
    expect(inspectTrackedPath('.env.example')).toEqual([]);
  });

  it('rejects personal paths, private tracker links, and ticket shorthand', () => {
    const personalRoot = '/' + ['Users', 'person', 'Personal', 'project'].join('/');
    const ticketReference = ['VIB', '31'].join('-');
    const trackerReference = ['linear.app', 'teotl', 'issue'].join('/');
    const findings = inspectTrackedContent(
      'src/example.ts',
      `See ${personalRoot}, ${trackerReference}, and ${ticketReference}.`
    );

    expect(findings.map((finding) => finding.kind)).toEqual([
      'personal-path',
      'private-tracker',
      'ticket-shorthand'
    ]);
    expect(inspectTrackedContent('src/hash.ts', 'Use SHA-256 and AES-256.')).toEqual([]);
  });

  it('contains no private repository material or ticket shorthand in the tracked tree', () => {
    const repositoryRoot = resolve(import.meta.dirname, '../../..');

    expect(scanOpenSourceReadiness(repositoryRoot)).toEqual([]);
  });
});
