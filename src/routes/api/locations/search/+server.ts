import { json } from '@sveltejs/kit';

import { searchAddresses } from '$server/locations/address-search';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (query.length < 3 || query.length > 120) return response({ error: 'invalid' }, 400);

  try {
    return response({ results: await searchAddresses(query, fetch) }, 200);
  } catch {
    return response({ error: 'unavailable' }, 502);
  }
};

function response(body: object, status: number): Response {
  return json(body, { status, headers: { 'cache-control': 'no-store' } });
}
