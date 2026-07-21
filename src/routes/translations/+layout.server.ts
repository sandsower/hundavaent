import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ setHeaders }) => {
  setHeaders({
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow'
  });
  return {};
};
