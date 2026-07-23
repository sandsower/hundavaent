export const achievementAcknowledgedEventName = 'hundavaent:achievement-acknowledged';
export const achievementChannelName = 'hundavaent-achievements';
export const achievementStorageKey = 'hundavaent:achievement:acknowledged';
const sourceId = createSourceId();

export function publishAchievementAcknowledged(): void {
  window.dispatchEvent(new Event(achievementAcknowledgedEventName));

  if (typeof BroadcastChannel !== 'undefined') {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(achievementChannelName);
      channel.postMessage({ type: 'acknowledged', sourceId });
      return;
    } catch {
      // Fall through to the storage signal when BroadcastChannel is unavailable.
    } finally {
      channel?.close();
    }
  }

  try {
    localStorage.setItem(achievementStorageKey, `${Date.now()}:${sourceId}`);
  } catch {
    // The same-tab event remains authoritative when browser coordination is blocked.
  }
}

export function subscribeToAchievementAcknowledged(onAcknowledged: () => void): () => void {
  const handleAcknowledged = () => onAcknowledged();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === achievementStorageKey) onAcknowledged();
  };
  const handleMessage = (event: MessageEvent<unknown>) => {
    if (
      typeof event.data === 'object' &&
      event.data !== null &&
      Object.keys(event.data).length === 2 &&
      'type' in event.data &&
      event.data.type === 'acknowledged' &&
      'sourceId' in event.data &&
      typeof event.data.sourceId === 'string' &&
      event.data.sourceId !== sourceId
    ) {
      onAcknowledged();
    }
  };
  let channel: BroadcastChannel | null = null;

  try {
    channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(achievementChannelName) : null;
  } catch {
    // The storage listener remains available when channel construction fails.
  }

  window.addEventListener(achievementAcknowledgedEventName, handleAcknowledged);
  window.addEventListener('storage', handleStorage);
  channel?.addEventListener('message', handleMessage);

  return () => {
    window.removeEventListener(achievementAcknowledgedEventName, handleAcknowledged);
    window.removeEventListener('storage', handleStorage);
    channel?.removeEventListener('message', handleMessage);
    channel?.close();
  };
}

function createSourceId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}
