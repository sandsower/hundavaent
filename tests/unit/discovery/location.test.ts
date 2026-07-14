import { describe, expect, it } from 'vitest';

import {
  clearSessionLocation,
  loadSessionLocation,
  markLocationDenied,
  saveSessionLocation,
  wasLocationDenied
} from '$lib/discovery/location';

describe('session location privacy', () => {
  it('stores only rounded approximate coordinates for this session', () => {
    const storage = createMemoryStorage();
    saveSessionLocation(storage, { latitude: 64.1466123, longitude: -21.9426456 });

    expect(loadSessionLocation(storage)).toEqual({ latitude: 64.147, longitude: -21.943 });
    expect(storage.getItem('hundavaent:discovery-location')).not.toContain('64.1466123');
    expect(storage.getItem('hundavaent:discovery-location')).not.toContain('-21.9426456');
  });

  it('remembers denial without automatically requesting again', () => {
    const storage = createMemoryStorage();
    expect(wasLocationDenied(storage)).toBe(false);
    markLocationDenied(storage);
    expect(wasLocationDenied(storage)).toBe(true);
    clearSessionLocation(storage);
    expect(wasLocationDenied(storage)).toBe(false);
  });

  it('ignores invalid stored coordinates', () => {
    const storage = createMemoryStorage();
    storage.setItem('hundavaent:discovery-location', '{"latitude":999,"longitude":0}');
    expect(loadSessionLocation(storage)).toBeNull();
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
