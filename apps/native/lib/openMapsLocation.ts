import { Linking, Platform } from "react-native";

interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Opens a location in Google Maps (app if installed, else its web page). On
 * iOS, `comgooglemaps://` reliably rejects when the app isn't installed —
 * unlike `canOpenURL`, this needs no `LSApplicationQueriesSchemes` entry —
 * so a missing app falls back to Apple Maps, which is always present.
 * Android has no equivalent gap: the web URL deep-links into the Google
 * Maps app when installed, or opens a browser otherwise.
 */
async function open(googleAppUrl: string, googleWebUrl: string, appleMapsUrl: string) {
  if (Platform.OS !== "ios") {
    await Linking.openURL(googleWebUrl);
    return;
  }

  try {
    await Linking.openURL(googleAppUrl);
  } catch {
    await Linking.openURL(appleMapsUrl);
  }
}

export function openMapsSearch(coords: Coordinates) {
  return open(
    `comgooglemaps://?q=${coords.latitude},${coords.longitude}`,
    `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`,
    `https://maps.apple.com/?q=${coords.latitude},${coords.longitude}`,
  );
}

export function openMapsDirections(coords: Coordinates) {
  return open(
    `comgooglemaps://?daddr=${coords.latitude},${coords.longitude}&directionsmode=driving`,
    `https://www.google.com/maps/dir/?api=1&destination=${coords.latitude},${coords.longitude}`,
    `https://maps.apple.com/?daddr=${coords.latitude},${coords.longitude}&dirflg=d`,
  );
}
