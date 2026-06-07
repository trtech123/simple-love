import { describe, expect, it } from "vitest";

import { apiError, apiSuccess } from "../../src/app/api/envelope";

describe("API envelope", () => {
  it("wraps successful data in a stable ok envelope", async () => {
    const response = apiSuccess({ complete: true });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { complete: true },
    });
  });

  it("wraps failures with stable codes and Hebrew browser messages", async () => {
    const response = apiError({
      status: 401,
      code: "authentication_required",
      message: "צריך להתחבר כדי להמשיך.",
      details: { next: "/profile/matching" },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "authentication_required",
      message: "צריך להתחבר כדי להמשיך.",
      details: { next: "/profile/matching" },
    });
  });
});
