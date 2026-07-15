export type AuthOrigin = 'header' | 'favourite' | 'rating';

export type PendingAuthIntent =
  | { action: 'favourite'; placeId: string; placeName?: string }
  | { action: 'rating'; placeId: string; placeName: string; overallRating: number };

export interface AuthRequest {
  origin: AuthOrigin;
  intent?: PendingAuthIntent;
  continuationToken?: string;
}

export const authRequestEventName = 'hundavaent:auth-requested';

export function requestAuthentication(request: AuthRequest): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AuthRequest>(authRequestEventName, { detail: request }));
}

export function isAuthRequest(value: unknown): value is AuthRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuthRequest>;
  if (!['header', 'favourite', 'rating'].includes(candidate.origin ?? '')) return false;
  if (!candidate.intent) return candidate.origin === 'header' && !candidate.continuationToken;
  if (candidate.continuationToken && candidate.continuationToken.length < 32) return false;
  if (!candidate.intent.placeId) return false;
  if (
    candidate.intent.placeName !== undefined &&
    (typeof candidate.intent.placeName !== 'string' || candidate.intent.placeName.trim() === '')
  ) {
    return false;
  }
  if (candidate.intent.action === 'favourite') return candidate.origin === 'favourite';
  if (!candidate.intent.placeName) return false;
  return (
    candidate.intent.action === 'rating' &&
    candidate.origin === 'rating' &&
    Number.isInteger(candidate.intent.overallRating) &&
    candidate.intent.overallRating >= 1 &&
    candidate.intent.overallRating <= 5
  );
}
