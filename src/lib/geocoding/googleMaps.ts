export interface GeocodedLocation {
  city: string | null;
  state: string | null;
}

interface GoogleAddressComponent {
  long_name: string;
  types: string[];
}

/**
 * Reverse-geocodes one coordinate via the Google Maps Geocoding API. Returns
 * null on any failure (missing key, network error, no results) so callers
 * fall back to a generic label instead of the request failing outright —
 * this is a paid third-party call sitting behind a user-facing page load.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodedLocation | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`reverseGeocode(${lat},${lng}) failed: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
      if (data.status !== "ZERO_RESULTS") console.error(`reverseGeocode(${lat},${lng}) failed: ${data.status}`);
      return null;
    }

    const components = data.results[0].address_components as GoogleAddressComponent[];
    const findType = (type: string) => components.find((c) => c.types.includes(type))?.long_name ?? null;

    return {
      city: findType("locality") ?? findType("administrative_area_level_2"),
      state: findType("administrative_area_level_1"),
    };
  } catch (err) {
    console.error(`reverseGeocode(${lat},${lng}) failed:`, err);
    return null;
  }
}
