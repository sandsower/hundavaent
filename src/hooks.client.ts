import type { HandleClientError } from '@sveltejs/kit';

import { captureClientError } from '$lib/analytics/client-error';

export const handleError: HandleClientError = captureClientError;
