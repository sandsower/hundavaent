import { describe, expect, it } from 'vitest';

import { parseOptions } from '../../../scripts/acquire-place-photos';

describe('place photo acquisition CLI options', () => {
  it('collects explicitly reviewed Wikimedia Commons source IDs', () => {
    expect(
      parseOptions([
        '--live',
        '--approved-source-id',
        'wikimedia-commons:123',
        '--approved-source-id',
        'wikimedia-commons:456'
      ]).approvedSourceIds
    ).toEqual(['wikimedia-commons:123', 'wikimedia-commons:456']);
  });

  it('rejects malformed reviewed source IDs', () => {
    expect(() => parseOptions(['--live', '--approved-source-id', 'commons:123'])).toThrow(
      '--approved-source-id requires a Wikimedia Commons source ID'
    );
  });
});
