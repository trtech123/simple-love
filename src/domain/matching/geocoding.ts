export type GeocodedLocation = {
  latitude: number;
  longitude: number;
};

type NominatimResult = {
  lat?: string;
  lon?: string;
};

type NominatimOptions = {
  appBaseUrl?: string;
  fetchImpl?: typeof fetch;
  throttle?: boolean;
  userAgent?: string;
};

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_MIN_INTERVAL_MS = 1000;
const DEFAULT_APP_BASE_URL = "http://localhost:3000";
let lastNominatimRequestAt = 0;
let nominatimQueue = Promise.resolve();

export async function geocodeLocationText(locationText: string) {
  return geocodeLocationTextWithNominatim(locationText);
}

export async function geocodeLocationTextWithNominatim(
  locationText: string,
  options: NominatimOptions = {},
): Promise<GeocodedLocation | null> {
  const query = locationText.trim();

  if (!query) {
    return null;
  }

  if (options.throttle !== false) {
    await waitForNominatimSlot();
  }

  const appBaseUrl = options.appBaseUrl ?? process.env.APP_BASE_URL ?? DEFAULT_APP_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent = options.userAgent ?? `simple-love/0.1 (${appBaseUrl})`;
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  const response = await fetchImpl(url.toString(), {
    headers: {
      Accept: "application/json",
      Referer: appBaseUrl,
      "User-Agent": userAgent,
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim geocoding failed with status ${response.status}`);
  }

  const data = (await response.json().catch(() => null)) as NominatimResult[] | null;
  const first = Array.isArray(data) ? data[0] : null;
  const latitude = Number(first?.lat);
  const longitude = Number(first?.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

async function waitForNominatimSlot() {
  const previous = nominatimQueue;
  let release: () => void = () => undefined;
  nominatimQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  const elapsed = Date.now() - lastNominatimRequestAt;
  const delayMs = Math.max(0, NOMINATIM_MIN_INTERVAL_MS - elapsed);

  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  lastNominatimRequestAt = Date.now();
  release();
}
