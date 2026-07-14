import type { MapAdapter } from './types';

export function createFailingMapAdapter(): MapAdapter {
  return {
    mount() {
      throw new Error('Injected map adapter failure');
    },
    setPlaces() {},
    setSelectedPlace() {},
    focusPlace() {},
    setCamera() {},
    destroy() {}
  };
}
