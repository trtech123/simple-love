import { describe, expect, it, vi } from "vitest";
import { geocodeLocationTextWithNominatim } from "../../src/domain/matching/geocoding";

function responseWithJson(data: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 429,
    json: async () => data,
  } as Response;
}

describe("Nominatim geocoding", () => {
  it("sends identifying headers and parses the first coordinate result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(responseWithJson([{ lat: "32.0853", lon: "34.7818" }]));

    const result = await geocodeLocationTextWithNominatim("Tel Aviv", {
      appBaseUrl: "https://lovlov.me",
      fetchImpl,
      throttle: false,
      userAgent: "simple-love-test/1.0",
    });

    expect(result).toEqual({ latitude: 32.0853, longitude: 34.7818 });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("https://nominatim.openstreetmap.org/search"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          Referer: "https://lovlov.me",
          "User-Agent": "simple-love-test/1.0",
        }),
      }),
    );
  });

  it("returns null when Nominatim has no usable coordinate result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(responseWithJson([]));

    await expect(
      geocodeLocationTextWithNominatim("Unknown", {
        fetchImpl,
        throttle: false,
      }),
    ).resolves.toBeNull();
  });
});
