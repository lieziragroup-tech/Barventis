/**
 * Geolocation & Haversine Distance Utilities
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}
export type Coordinates = LatLng;
export const calculateHaversineDistance = calculateDistanceMeters;
export function validateGeofence(userLocation: LatLng, projectLocation: LatLng, radiusMeters: number, accuracyMeters = 0) {
  const distanceMeters = calculateDistanceMeters(userLocation, projectLocation);
  const tolerance = Math.min(Math.max(0, accuracyMeters || 0), 35);
  const effectiveRadius = radiusMeters + tolerance;
  const isInside = distanceMeters <= effectiveRadius;
  return {
    isInside,
    distanceMeters,
    differenceMeters: isInside ? 0 : Math.round((distanceMeters - radiusMeters) * 100) / 100,
  };
}

/**
 * Calculates distance in meters between two geographic coordinates
 * using the Haversine formula.
 */
export function calculateDistanceMeters(
  a: LatLng | number,
  b: LatLng | number,
  c?: number,
  d?: number
): number {
  const lat1 = typeof a === "number" ? a : a.latitude;
  const lon1 = typeof a === "number" ? (b as number) : a.longitude;
  const lat2 = typeof a === "number" ? (c ?? 0) : (b as LatLng).latitude;
  const lon2 = typeof a === "number" ? (d ?? 0) : (b as LatLng).longitude;

  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const x =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return Math.round(R * y);
}

export function isLocationWithinRadius(
  userLocation: LatLng,
  projectLocation: LatLng,
  radiusMeters: number,
  accuracyMeters = 0
): { isWithin: boolean; distance: number } {
  const distance = calculateDistanceMeters(userLocation, projectLocation);
  const tolerance = Math.min(Math.max(0, accuracyMeters || 0), 35);
  return {
    isWithin: distance <= (radiusMeters + tolerance),
    distance,
  };
}

/**
 * Checks if user location is within the defined project radius.
 * Supports both (lat1, lon1, lat2, lon2, radiusMeters) -> boolean
 * and (userLocation: LatLng, projectLocation: LatLng, radiusMeters: number) -> boolean
 */
export function isWithinRadius(
  a: LatLng | number,
  b: LatLng | number,
  c: number,
  d?: number,
  radiusMeters?: number,
  accuracyMeters = 0
): boolean {
  if (typeof a === "number") {
    const dist = calculateDistanceMeters(a, b as number, c, d ?? 0);
    const tolerance = Math.min(Math.max(0, accuracyMeters || 0), 35);
    return dist <= ((radiusMeters ?? 100) + tolerance);
  }
  const dist = calculateDistanceMeters(a, b as LatLng);
  const tolerance = Math.min(Math.max(0, accuracyMeters || (typeof d === "number" ? d : 0)), 35);
  return dist <= (c + tolerance);
}

/**
 * Formats distance in meters or kilometers for human display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Formats coordinates for clean display
 */
export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/**
 * Preset client premises in Jakarta / Tangerang area — quick-fill locations
 * for common pest control job sites, so a technician doesn't have to type
 * a full address for a returning client.
 */
export const PRESET_PROJECT_LOCATIONS = [
  {
    name: 'RS Hermina BSD',
    address: 'Jl. Pahlawan Seribu Kav. 1, BSD City, Serpong, Tangerang Selatan',
    latitude: -6.298144,
    longitude: 106.671342,
    radius: 100,
  },
  {
    name: 'Menara Perkantoran TB Simatupang',
    address: 'Jl. TB Simatupang No. 18, Cilandak, Jakarta Selatan',
    latitude: -6.294520,
    longitude: 106.801230,
    radius: 100,
  },
  {
    name: 'Gedung Perkantoran Thamrin',
    address: 'Jl. M.H. Thamrin No. 8, Menteng, Jakarta Pusat',
    latitude: -6.186540,
    longitude: 106.823480,
    radius: 150,
  },
  {
    name: 'Kompleks Ruko Gandul',
    address: 'Jl. Raya Gandul No. 45, Cinere, Kota Depok',
    latitude: -6.331200,
    longitude: 106.789100,
    radius: 120,
  },
];
