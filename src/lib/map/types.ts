export interface MapPlace {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  category?: string;
  draggable?: boolean;
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
  onMarkerMove?: (placeId: string, point: MapPoint) => void;
  /** Fires true while a user gesture moves the map, false when it settles. */
  onMoveStateChange?: (moving: boolean) => void;
}

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapCameraOptions {
  duration?: number;
  easing?: (t: number) => number;
  padding?: MapPadding;
}

export interface MapAdapter {
  mount(container: HTMLElement, callbacks: MapCallbacks): void | Promise<void>;
  setPlaces(places: readonly MapPlace[]): void;
  setSelectedPlace(placeId: string | null): void;
  focusPlace(placeId: string): void;
  setCamera(camera: MapCamera, options?: MapCameraOptions): void;
  setPadding?(padding: MapPadding, options?: { duration?: number }): void;
  fitToPlaces?(places: readonly MapPlace[]): void;
  /** Shows the reader's own position as a passive dot; null clears it. */
  setViewerLocation?(point: MapPoint | null): void;
  destroy(): void;
}
