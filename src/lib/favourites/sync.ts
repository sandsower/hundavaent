const channelName = 'hundavaent-favourites';
const storageKey = 'hundavaent:favourites:invalidate';
const sourceId = createSourceId();

export function publishFavouriteInvalidation(): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(channelName);
      channel.postMessage({ type: 'invalidate', sourceId });
      channel.close();
      return;
    }

    localStorage.setItem(storageKey, String(Date.now()));
  } catch {
    // The database response remains authoritative when browser coordination is unavailable.
  }
}

export function subscribeToFavouriteInvalidation(onInvalidate: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) onInvalidate();
  };
  const handleMessage = (event: MessageEvent<unknown>) => {
    if (
      typeof event.data === 'object' &&
      event.data !== null &&
      'type' in event.data &&
      event.data.type === 'invalidate' &&
      'sourceId' in event.data &&
      event.data.sourceId !== sourceId
    ) {
      onInvalidate();
    }
  };
  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;

  channel?.addEventListener('message', handleMessage);
  window.addEventListener('storage', handleStorage);

  return () => {
    channel?.removeEventListener('message', handleMessage);
    channel?.close();
    window.removeEventListener('storage', handleStorage);
  };
}

function createSourceId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}
