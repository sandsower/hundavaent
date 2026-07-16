import type { User } from '@supabase/supabase-js';

import type { RequestSupabaseClient } from '$server/db/clients';
import type { Database } from '$server/db/generated.types';

export type AppRole = 'member' | 'trusted_contributor' | 'moderator' | 'venue_representative';

export interface SessionUser {
  id: string;
}

interface ProviderError {
  message: string;
  name?: string;
  code?: string;
  status?: number;
}

const invalidSessionErrorCodes = new Set([
  'bad_jwt',
  'invalid_jwt',
  'invalid_token',
  'jwt_expired',
  'refresh_token_already_used',
  'refresh_token_not_found',
  'session_expired'
]);

const invalidSessionErrorNames = new Set(['AuthInvalidCredentialsError', 'AuthInvalidJwtError']);

export interface CallerScopedSupabaseClient {
  auth: {
    getUser(): Promise<{
      data: { user: SessionUser | null };
      error: ProviderError | null;
    }>;
  };
  rpc(
    functionName: 'has_current_user_role',
    parameters: { required_role: AppRole }
  ): PromiseLike<{
    data: boolean | null;
    error: ProviderError | null;
  }>;
}

export type SessionState = { status: 'anonymous' } | { status: 'authenticated'; user: SessionUser };

type MemberAccount =
  Database['public']['Functions']['get_current_member_account']['Returns'][number];

export type MemberSessionState =
  | { status: 'anonymous' }
  | { status: 'orphaned'; user: User }
  | { status: 'member'; user: User; account: MemberAccount };

export class AuthenticationUnavailableError extends Error {
  constructor() {
    super('Authentication is temporarily unavailable');
    this.name = 'AuthenticationUnavailableError';
  }
}

export class AuthenticationExpiredError extends Error {
  constructor() {
    super('Authentication session expired');
    this.name = 'AuthenticationExpiredError';
  }
}

export async function getSession(client: CallerScopedSupabaseClient): Promise<SessionState> {
  try {
    const { data, error } = await client.auth.getUser();

    if (error && isMissingSessionError(error)) {
      return { status: 'anonymous' };
    }

    if (error) {
      throw new AuthenticationUnavailableError();
    }

    if (data.user === null) {
      return { status: 'anonymous' };
    }

    return { status: 'authenticated', user: data.user };
  } catch (error) {
    if (error instanceof AuthenticationUnavailableError) {
      throw error;
    }

    throw new AuthenticationUnavailableError();
  }
}

export async function getMemberSession(client: RequestSupabaseClient): Promise<MemberSessionState> {
  let authResult: Awaited<ReturnType<typeof client.auth.getUser>>;

  try {
    authResult = await client.auth.getUser();
  } catch {
    throw new AuthenticationUnavailableError();
  }

  if (authResult.error && isMissingSessionError(authResult.error)) {
    return { status: 'anonymous' };
  }
  if (authResult.error) {
    if (isInvalidSessionError(authResult.error)) throw new AuthenticationExpiredError();
    throw new AuthenticationUnavailableError();
  }
  if (!authResult.data.user) return { status: 'anonymous' };

  try {
    const { data, error } = await client.rpc('get_current_member_account');
    if (error) throw new AuthenticationUnavailableError();
    const account = data?.[0];
    return account
      ? { status: 'member', user: authResult.data.user, account }
      : { status: 'orphaned', user: authResult.data.user };
  } catch (error) {
    if (error instanceof AuthenticationUnavailableError) throw error;
    throw new AuthenticationUnavailableError();
  }
}

function isMissingSessionError(error: ProviderError): boolean {
  return (
    error.name === 'AuthSessionMissingError' ||
    error.code === 'session_not_found' ||
    error.message === 'Auth session missing!'
  );
}

function isInvalidSessionError(error: ProviderError): boolean {
  if (error.code && invalidSessionErrorCodes.has(error.code)) return true;
  if (error.name && invalidSessionErrorNames.has(error.name)) return true;

  const message = error.message.toLowerCase();
  const mentionsCredential = /\b(jwt|access token|refresh token|session)\b/.test(message);
  const confirmsInvalidity = /\b(expired|invalid)\b/.test(message);
  return mentionsCredential && confirmsInvalidity;
}
