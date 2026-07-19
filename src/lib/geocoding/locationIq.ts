export interface GeocodedLocation {
  city: string | null;
  state: string | null;
}

interface LocationIqAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
}

/**
 * Reverse-geocodes one coordinate via LocationIQ's free-tier API (Nominatim
 * data, hosted). Returns null on any failure (missing key, network error,
 * no results) so callers fall back to a generic label instead of the
 * request failing outright.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodedLocation | null> {
  const apiKey = process.env.LOCATIONIQ_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://us1.locationiq.com/v1/reverse?key=${apiKey}&lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url);
    if (!res.ok) {
      // LocationIQ returns 404 with {"error":"Unable to geocode"} for points with no nearby address data.
      if (res.status !== 404) console.error(`reverseGeocode(${lat},${lng}) failed: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const address = data?.address as LocationIqAddress | undefined;
    if (!address) return null;

    return {
      city: address.city ?? address.town ?? address.village ?? address.municipality ?? address.county ?? null,
      state: address.state ?? null,
    };
  } catch (err) {
    console.error(`reverseGeocode(${lat},${lng}) failed:`, err);
    return null;
  }
}
