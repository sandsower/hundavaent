export type AppRole = 'member' | 'trusted_contributor' | 'moderator' | 'venue_representative';

export interface SessionUser {
  id: string;
}

interface ProviderError {
  message: string;
  name?: string;
  code?: string;
}

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

export class AuthenticationUnavailableError extends Error {
  constructor() {
    super('Authentication is temporarily unavailable');
    this.name = 'AuthenticationUnavailableError';
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

function isMissingSessionError(error: ProviderError): boolean {
  return (
    error.name === 'AuthSessionMissingError' ||
    error.code === 'session_not_found' ||
    error.message === 'Auth session missing!'
  );
}
