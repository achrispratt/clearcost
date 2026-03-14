function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function haversineMiles(
  originLat: number,
  originLng: number,
  targetLat: number,
  targetLng: number
): number {
  const earthRadiusMiles = 3958.8;
  const latDelta = toRadians(targetLat - originLat);
  const lngDelta = toRadians(targetLng - originLng);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(originLat)) *
      Math.cos(toRadians(targetLat)) *
      Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
}
