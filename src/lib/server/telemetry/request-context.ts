const trustedRequestIdPattern = /^[A-Za-z0-9_-]{8,128}$/;

export function createRequestId(headers: Headers): string {
  const suppliedRequestId = headers.get('x-request-id');

  if (suppliedRequestId && trustedRequestIdPattern.test(suppliedRequestId)) {
    return suppliedRequestId;
  }

  return crypto.randomUUID();
}

export function createPublicServerError(requestId: string): App.Error {
  return {
    message: 'Something went wrong',
    requestId
  };
}
