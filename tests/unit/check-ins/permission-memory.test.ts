import { describe, expect, it } from 'vitest';

import {
  clearCheckInLocationDenial,
  markCheckInLocationDenied,
  wasCheckInLocationDenied
} from '$lib/check-ins/permission-memory';

describe('Check-in location permission memory', () => {
  it('remembers denial only for the current session storage and never before it is set', () => {
    const storage = createMemoryStorage();
    expect(wasCheckInLocationDenied(storage)).toBe(false);
    markCheckInLocationDenied(storage);
    expect(wasCheckInLocationDenied(storage)).toBe(true);
    clearCheckInLocationDenial(storage);
    expect(wasCheckInLocationDenied(storage)).toBe(false);
  });

  it('never stores a coordinate-shaped value, only the denial flag', () => {
    const storage = createMemoryStorage();
    markCheckInLocationDenied(storage);
    const values = [...Array.from({ length: storage.length }, (_, index) => storage.key(index))]
      .filter((key): key is string => key !== null)
      .map((key) => storage.getItem(key));
    expect(values).toEqual(['1']);
  });

  it('uses a storage key distinct from the discovery proximity-search location memory', () => {
    const storage = createMemoryStorage();
    markCheckInLocationDenied(storage);
    expect(storage.getItem('hundavaent:discovery-location-denied')).toBeNull();
  });
});

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  };
}
