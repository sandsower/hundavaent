import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';

import { createAuthCallback } from '$server/auth/callback';
import { getMemberAuthConfig } from '$server/auth/member';
import { createMemberActivationProof } from '$server/auth/member-activation-proof';
import { resolveMemberProviderPolicy } from '$server/auth/provider-policy';

export const GET = createAuthCallback({
  resolveMemberAuthConfig: () => getMemberAuthConfig({ ...env, ...privateEnv }),
  resolveMemberProviderPolicy,
  createMemberActivationProof: (userId, requestId) =>
    createMemberActivationProof(privateEnv.MEMBER_ACTIVATION_SECRET, userId, requestId)
});
