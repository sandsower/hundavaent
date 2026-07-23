import type { FavouriteRecognition, WeeklyRhythmWeek } from './types';

export const weeklyRhythmActivatedEventName = 'hundavaent:weekly-rhythm-activated';
export const deferredFavouriteRecognitionEventName = 'hundavaent:deferred-favourite-recognition';
export const weeklyRhythmChannelName = 'hundavaent-weekly-rhythm';
export const weeklyRhythmStorageKey = 'hundavaent:weekly-rhythm:invalidate';
const sourceId = createSourceId();

export type DeferredFavouriteRecognitionTarget = 'list' | 'selected';

interface DeferredFavouriteRecognition {
  placeId: string;
  target: DeferredFavouriteRecognitionTarget;
  recognition: FavouriteRecognition;
}

export function publishWeeklyRhythmActivation(currentWeek: WeeklyRhythmWeek): void {
  window.dispatchEvent(
    new CustomEvent<WeeklyRhythmWeek>(weeklyRhythmActivatedEventName, {
      detail: currentWeek
    })
  );
}

export function publishWeeklyRhythmInvalidation(): void {
  if (typeof BroadcastChannel !== 'undefined') {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(weeklyRhythmChannelName);
      channel.postMessage({ type: 'invalidate', sourceId });
      return;
    } catch {
      // Fall through to the storage signal when BroadcastChannel is blocked or unavailable.
    } finally {
      channel?.close();
    }
  }

  try {
    localStorage.setItem(weeklyRhythmStorageKey, `${Date.now()}:${sourceId}`);
  } catch {
    // Same-tab authoritative state remains usable if browser coordination is unavailable.
  }
}

export function subscribeToWeeklyRhythmInvalidation(onInvalidate: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === weeklyRhythmStorageKey) onInvalidate();
  };
  const handleMessage = (event: MessageEvent<unknown>) => {
    if (
      typeof event.data === 'object' &&
      event.data !== null &&
      Object.keys(event.data).length === 2 &&
      'type' in event.data &&
      event.data.type === 'invalidate' &&
      'sourceId' in event.data &&
      typeof event.data.sourceId === 'string' &&
      event.data.sourceId !== sourceId
    ) {
      onInvalidate();
    }
  };
  let channel: BroadcastChannel | null = null;
  try {
    channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(weeklyRhythmChannelName)
        : null;
  } catch {
    // The storage listener below remains available when BroadcastChannel construction fails.
  }

  channel?.addEventListener('message', handleMessage);
  window.addEventListener('storage', handleStorage);

  return () => {
    channel?.removeEventListener('message', handleMessage);
    channel?.close();
    window.removeEventListener('storage', handleStorage);
  };
}

export function subscribeToWeeklyRhythmActivation(
  onActivate: (currentWeek: WeeklyRhythmWeek) => void
): () => void {
  const handleActivation = (event: Event) => {
    if (!(event instanceof CustomEvent) || !isWeeklyRhythmWeek(event.detail)) return;
    onActivate(event.detail);
  };
  window.addEventListener(weeklyRhythmActivatedEventName, handleActivation);
  return () => window.removeEventListener(weeklyRhythmActivatedEventName, handleActivation);
}

export function publishDeferredFavouriteRecognition(
  placeId: string,
  target: DeferredFavouriteRecognitionTarget,
  recognition: FavouriteRecognition
): void {
  window.dispatchEvent(
    new CustomEvent<DeferredFavouriteRecognition>(deferredFavouriteRecognitionEventName, {
      detail: { placeId, target, recognition }
    })
  );
}

export function subscribeToDeferredFavouriteRecognition(
  onRecognize: (recognition: FavouriteRecognition) => void,
  placeId: string,
  target: DeferredFavouriteRecognitionTarget
): () => void {
  const handleRecognition = (event: Event) => {
    if (!(event instanceof CustomEvent) || !isDeferredFavouriteRecognition(event.detail)) return;
    if (event.detail.placeId === placeId && event.detail.target === target) {
      onRecognize(event.detail.recognition);
    }
  };
  window.addEventListener(deferredFavouriteRecognitionEventName, handleRecognition);
  return () => window.removeEventListener(deferredFavouriteRecognitionEventName, handleRecognition);
}

function isWeeklyRhythmWeek(value: unknown): value is WeeklyRhythmWeek {
  return (
    typeof value === 'object' &&
    value !== null &&
    'startsOn' in value &&
    typeof value.startsOn === 'string' &&
    'endsOn' in value &&
    typeof value.endsOn === 'string' &&
    'active' in value &&
    typeof value.active === 'boolean'
  );
}

function isDeferredFavouriteRecognition(value: unknown): value is DeferredFavouriteRecognition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'placeId' in value &&
    typeof value.placeId === 'string' &&
    'target' in value &&
    (value.target === 'list' || value.target === 'selected') &&
    'recognition' in value &&
    typeof value.recognition === 'object' &&
    value.recognition !== null &&
    'firstTimeForPlace' in value.recognition &&
    typeof value.recognition.firstTimeForPlace === 'boolean' &&
    'activatedCurrentWeek' in value.recognition &&
    typeof value.recognition.activatedCurrentWeek === 'boolean' &&
    'currentWeek' in value.recognition &&
    isWeeklyRhythmWeek(value.recognition.currentWeek)
  );
}

function createSourceId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}
