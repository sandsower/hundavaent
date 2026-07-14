import { json } from '@sveltejs/kit';

export function privateJson(body: Record<string, unknown>, status = 200): Response {
  return json(body, {
    status,
    headers: { 'cache-control': 'private, no-store', vary: 'cookie' }
  });
}
