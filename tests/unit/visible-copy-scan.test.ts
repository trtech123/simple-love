import { describe, expect, it } from "vitest";

import { scanVisibleCopy } from "../../scripts/scan-visible-copy";

describe("visible copy scan", () => {
  it("finds mojibake and English visible copy in app surfaces", async () => {
    const findings = await scanVisibleCopy({
      roots: ["src/app", "src/components"],
      allowList: [
        "CHING",
        "LovLov",
        "LOVLOV",
        "ME",
      ],
    });

    expect(findings).toEqual([]);
  });
});
