export interface MapPlace {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  category?: string;
}

export interface MapCamera {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface MapCallbacks {
  onMarkerSelect: (placeId: string) => void;
  onClusterSelect?: (placeIds: readonly string[]) => void;
  onCameraChange: (camera: MapCamera) => void;
  onMapSelect?: (point: MapPoint) => void;
}

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MapAdapter {
  mount(container: HTMLElement, callbacks: MapCallbacks): void | Promise<void>;
  setPlaces(places: readonly MapPlace[]): void;
  setSelectedPlace(placeId: string | null): void;
  focusPlace(placeId: string): void;
  setCamera(camera: MapCamera): void;
  fitToPlaces?(places: readonly MapPlace[]): void;
  destroy(): void;
}
