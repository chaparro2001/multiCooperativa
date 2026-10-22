/**
 * Native maps search for a free-text place ("Cómo llegar"). No coordinates and no geocoding: the
 * maps app resolves the text. `platform` is React Native's `Platform.OS`.
 */
export function mapsSearchUrl(place: string, platform: string): string {
  const query = encodeURIComponent(place.trim());
  if (platform === 'ios') return `https://maps.apple.com/?q=${query}`;
  if (platform === 'android') return `geo:0,0?q=${query}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
