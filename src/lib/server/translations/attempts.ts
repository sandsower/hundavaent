export const TRANSLATION_MAX_FAILED_ATTEMPTS = 5;
export const TRANSLATION_THROTTLE_SECONDS = 15 * 60;

interface AttemptRecord {
  failures: number;
  blockedUntil: number;
  updatedAt: number;
}

export class TranslationAttemptThrottle {
  private readonly attempts = new Map<string, AttemptRecord>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  check(key: string): { blocked: boolean; retryAfterSeconds: number } {
    const record = this.attempts.get(key);
    if (!record) return { blocked: false, retryAfterSeconds: 0 };
    const remaining = record.blockedUntil - this.now();
    if (remaining <= 0) {
      if (record.blockedUntil > 0) this.attempts.delete(key);
      return { blocked: false, retryAfterSeconds: 0 };
    }
    return { blocked: true, retryAfterSeconds: Math.ceil(remaining / 1000) };
  }

  recordFailure(key: string): { blocked: boolean; retryAfterSeconds: number } {
    const now = this.now();
    const current = this.attempts.get(key);
    const failures = (current?.failures ?? 0) + 1;
    const blockedUntil =
      failures >= TRANSLATION_MAX_FAILED_ATTEMPTS ? now + TRANSLATION_THROTTLE_SECONDS * 1000 : 0;
    this.attempts.set(key, { failures, blockedUntil, updatedAt: now });
    this.prune(now);
    return this.check(key);
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }

  private prune(now: number): void {
    if (this.attempts.size <= 1_000) return;
    for (const [key, record] of this.attempts) {
      if (record.updatedAt < now - TRANSLATION_THROTTLE_SECONDS * 1000) this.attempts.delete(key);
      if (this.attempts.size <= 900) break;
    }
  }
}

export const translationAttemptThrottle = new TranslationAttemptThrottle();

export function translationClientKey(headers: Headers): string {
  const value = headers.get('cf-connecting-ip')?.trim();
  return value && value.length <= 64 ? value : 'unknown';
}
