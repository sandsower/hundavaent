import { env as privateEnvironment } from '$env/dynamic/private';
import { env as publicEnvironment } from '$env/dynamic/public';

import {
  createServiceRoleSupabaseClient,
  getSupabaseServiceConfig,
  type RequestSupabaseClient
} from '$server/db/clients';

/**
 * The service-role client the photo upload endpoint writes Storage with, or null when the secret
 * is not configured. Null is a deployment state, not an error: the endpoint answers 503 and no
 * bytes move, which is the same fail-closed reading the abuse policy takes when it is unset.
 */
export function createPlacePhotoStorageClient(): RequestSupabaseClient | null {
  const config = getSupabaseServiceConfig(publicEnvironment, privateEnvironment);
  return config ? createServiceRoleSupabaseClient(config) : null;
}
