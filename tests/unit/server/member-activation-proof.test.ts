import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createMemberActivationProof,
  memberActivationPolicyVersion
} from '../../../src/lib/server/auth/member-activation-proof';

describe('Member activation callback proof', () => {
  it('binds a callback-only HMAC to the Member, request, and policy version', async () => {
    const secret = 'local-member-activation-capability-secret-v1';
    const userId = '74000000-0000-4000-8000-000000000001';
    const requestId = 'callback-request-1';
    const expected = createHmac('sha256', secret)
      .update(`${userId}:${requestId}:${memberActivationPolicyVersion}`)
      .digest('hex');

    await expect(createMemberActivationProof(secret, userId, requestId)).resolves.toBe(expected);
    await expect(
      createMemberActivationProof(secret, userId, 'callback-request-2')
    ).resolves.not.toBe(expected);
  });

  it('fails closed without a sufficiently strong server capability', async () => {
    await expect(
      createMemberActivationProof(undefined, '74000000-0000-4000-8000-000000000001', 'request-1')
    ).resolves.toBeNull();
    await expect(
      createMemberActivationProof('too-short', '74000000-0000-4000-8000-000000000001', 'request-1')
    ).resolves.toBeNull();
  });
});
