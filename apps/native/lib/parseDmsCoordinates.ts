const DMS_TOKEN = /^(\d+(?:\.\d+)?)°\s*(\d+(?:\.\d+)?)['′]\s*(\d+(?:\.\d+)?)["″]?\s*([NSEW])$/i;

function parseDmsToken(token: string): number | null {
  const match = token.trim().match(DMS_TOKEN);
  if (!match) {
    return null;
  }

  const [, degrees, minutes, seconds, hemisphere] = match;
  const decimal = Number(degrees) + Number(minutes) / 60 + Number(seconds) / 3600;
  const sign = hemisphere.toUpperCase() === "S" || hemisphere.toUpperCase() === "W" ? -1 : 1;

  return sign * decimal;
}

/** Parses a `31°31'54.3"S 115°38'41.4"E` style GPS string into decimal coordinates, or null if it doesn't match. */
export function parseDmsCoordinates(value: string): { latitude: number; longitude: number } | null {
  const [latToken, lngToken, ...rest] = value.trim().split(/\s+/);
  if (!latToken || !lngToken || rest.length > 0) {
    return null;
  }

  const latitude = parseDmsToken(latToken);
  const longitude = parseDmsToken(lngToken);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}
