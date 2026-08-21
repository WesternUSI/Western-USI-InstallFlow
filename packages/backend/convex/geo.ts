/**
 * Distance-from-East-Perth ordering for Complete Installs (SRS FR-CI-6):
 * default furthest-first, Reverse Order flips to nearest-first. Site GPS
 * coordinates come in as DMS strings from the Go Site Database sheet, e.g.
 * `31°57'02.2"S 115°51'35.0"E`.
 */

// East Perth railway station, Perth WA — 31°56'38"S 115°52'37"E.
const EAST_PERTH_LAT = -31.943896;
const EAST_PERTH_LNG = 115.876976;

const DMS_PATTERN = /(\d+)°(\d+)'([\d.]+)"([NS])\s+(\d+)°(\d+)'([\d.]+)"([EW])/;

function dmsToDecimal(deg: number, min: number, sec: number, hemisphere: string): number {
  const decimal = deg + min / 60 + sec / 3600;
  return hemisphere === "S" || hemisphere === "W" ? -decimal : decimal;
}

/** Parses a `sites.location` DMS string into decimal lat/long, or null if unparseable. */
export function parseCoordinates(location: string): { lat: number; lng: number } | null {
  const match = DMS_PATTERN.exec(location);
  if (!match) return null;

  const [, latDeg, latMin, latSec, latHem, lngDeg, lngMin, lngSec, lngHem] = match;
  return {
    lat: dmsToDecimal(Number(latDeg), Number(latMin), Number(latSec), latHem),
    lng: dmsToDecimal(Number(lngDeg), Number(lngMin), Number(lngSec), lngHem),
  };
}

/** Great-circle distance between two lat/long points, in kilometres. */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadiusKm = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

/** Distance from East Perth Station, in kilometres — null if `location` is missing or unparseable. */
export function distanceFromEastPerthKm(location: string | undefined): number | null {
  if (!location) return null;
  const coords = parseCoordinates(location);
  if (!coords) return null;
  return haversineKm(coords, { lat: EAST_PERTH_LAT, lng: EAST_PERTH_LNG });
}
