import {
  AuthenticationUnavailableError,
  getSession,
  type AppRole,
  type CallerScopedSupabaseClient,
  type SessionUser
} from './session';

export { AuthenticationUnavailableError } from './session';

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthenticationRequiredError';
  }
}

export class RoleRequiredError extends Error {
  readonly requiredRole: AppRole;

  constructor(requiredRole: AppRole) {
    super('Required role is missing');
    this.name = 'RoleRequiredError';
    this.requiredRole = requiredRole;
  }
}

export async function requireRole(
  client: CallerScopedSupabaseClient,
  requiredRole: AppRole
): Promise<SessionUser> {
  const session = await getSession(client);

  if (session.status === 'anonymous') {
    throw new AuthenticationRequiredError();
  }

  try {
    const { data: hasRole, error } = await client.rpc('has_current_user_role', {
      required_role: requiredRole
    });

    if (error) {
      throw new AuthenticationUnavailableError();
    }

    if (hasRole !== true) {
      throw new RoleRequiredError(requiredRole);
    }

    return session.user;
  } catch (error) {
    if (error instanceof RoleRequiredError || error instanceof AuthenticationUnavailableError) {
      throw error;
    }

    throw new AuthenticationUnavailableError();
  }
}
