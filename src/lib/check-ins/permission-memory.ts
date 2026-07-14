// Remembers only a "the Member declined location this session" boolean, in a storage key
// deliberately separate from $lib/discovery/location.ts. That module persists rounded approximate
// coordinates in sessionStorage for its own, differently-scoped proximity-search convenience; the
// Check-in privacy posture is stricter (no coordinate of any precision is ever persisted anywhere,
// including the browser's own storage), so this module never shares a key or a value shape with it.
const deniedKey = 'hundavaent:check-in-location-denied';

export function markCheckInLocationDenied(storage: Storage): void {
  storage.setItem(deniedKey, '1');
}

export function wasCheckInLocationDenied(storage: Storage): boolean {
  return storage.getItem(deniedKey) === '1';
}

export function clearCheckInLocationDenial(storage: Storage): void {
  storage.removeItem(deniedKey);
}
