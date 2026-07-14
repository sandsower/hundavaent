import type { AppRole } from './session';
import type { RequestSupabaseClient } from '$server/db/clients';

export async function hasOptionalRole(
  client: Pick<RequestSupabaseClient, 'rpc'>,
  role: AppRole
): Promise<boolean> {
  try {
    const { data, error } = await client.rpc('has_current_user_role', {
      required_role: role
    });

    return error === null && data === true;
  } catch {
    return false;
  }
}
