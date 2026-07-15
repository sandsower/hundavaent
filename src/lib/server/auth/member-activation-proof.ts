export const memberActivationPolicyVersion = 'member-linked-providers-v2';

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

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const payload = `${userId}:${requestId}:${memberActivationPolicyVersion}`;
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

    return [...new Uint8Array(signature)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}
