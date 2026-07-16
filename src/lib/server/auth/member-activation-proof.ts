export const memberActivationPolicyVersion = 'member-linked-providers-v2';
export const authPendingIntentPolicyVersion = 'auth-pending-intent-v1';

const minimumCapabilityLength = 32;
const encoder = new TextEncoder();

export async function createMemberActivationProof(
  secret: string | undefined,
  userId: string,
  requestId: string
): Promise<string | null> {
  if (
    !secret ||
    secret.length < minimumCapabilityLength ||
    !userId ||
    !requestId ||
    requestId.length > 128
  ) {
    return null;
  }

  return sign(secret, `${userId}:${requestId}:${memberActivationPolicyVersion}`);
}

export async function createAuthPendingIntentSubject(
  secret: string | undefined,
  clientAddress: string
): Promise<string | null> {
  if (!secret || secret.length < minimumCapabilityLength || !clientAddress.trim()) return null;
  return sign(secret, `client:${clientAddress.trim()}:${authPendingIntentPolicyVersion}`);
}

export async function createAuthPendingIntentProof(
  secret: string | undefined,
  creationSubject: string,
  action: 'favourite' | 'rating',
  placeId: string,
  overallRating: number | null,
  requestId: string
): Promise<string | null> {
  if (
    !secret ||
    secret.length < minimumCapabilityLength ||
    !/^[0-9a-f]{64}$/.test(creationSubject) ||
    !placeId ||
    !requestId ||
    requestId.length > 128
  ) {
    return null;
  }

  return sign(
    secret,
    [
      'pending',
      creationSubject,
      action,
      placeId,
      overallRating === null ? '' : String(overallRating),
      requestId,
      authPendingIntentPolicyVersion
    ].join(':')
  );
}

async function sign(secret: string, payload: string): Promise<string | null> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

    return [...new Uint8Array(signature)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}
