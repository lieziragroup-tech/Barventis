export interface AddressSuggestion {
  displayName: string;
  mainText: string;
  secondaryText: string;
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
  } catch (error) {
    console.error("Geocoding failed", error);
  }
  return null;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`);
    const data = await response.json();
    if (data && data.display_name) {
      return data.display_name;
    }
  } catch (error) {
    console.error("Reverse geocoding failed", error);
  }
  return null;
}

/**
 * Pencarian rekomendasi alamat instan (Address Autocomplete ala Google Maps).
 * Memanggil OpenStreetMap Nominatim dengan fallback Photon Komoot untuk hasil cepat dan relevan.
 */
export async function searchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  const cleanQ = query.trim();
  if (!cleanQ || cleanQ.length < 3) return [];

  // Strategi 1: Nominatim OpenStreetMap
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQ)}&addressdetails=1&limit=6&countrycodes=id`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'id,en' } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((item: any) => {
          const parts = String(item.display_name || '').split(/,\s*/);
          const mainText = parts[0] || cleanQ;
          const secondaryText = parts.slice(1, 5).join(', ');
          return {
            displayName: item.display_name,
            mainText,
            secondaryText: secondaryText || item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          };
        }).filter(item => !isNaN(item.lat) && !isNaN(item.lng));
      }
    }
  } catch {
    // Fallback ke strategi 2 jika Nominatim ada kendala koneksi
  }

  // Strategi 2: Photon Komoot API (High-performance OSM autocomplete)
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQ)}&limit=6&lat=-6.200000&lon=106.816666`;
    const res = await fetch(photonUrl);
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.features)) {
        return json.features.map((f: any) => {
          const p = f.properties || {};
          const coords = f.geometry?.coordinates || [106.816666, -6.200000];
          const mainText = p.name || cleanQ;
          const secondaryParts = [p.street, p.district, p.city || p.county, p.state].filter(Boolean);
          const secondaryText = secondaryParts.join(', ');
          const displayName = [mainText, secondaryText].filter(Boolean).join(', ');
          return {
            displayName,
            mainText,
            secondaryText: secondaryText || mainText,
            lat: coords[1],
            lng: coords[0],
          };
        }).filter((item: any) => !isNaN(item.lat) && !isNaN(item.lng));
      }
    }
  } catch {
    // Return empty on network issues
  }

  return [];
}
