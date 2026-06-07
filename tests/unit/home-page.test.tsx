import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

describe("/ home page", () => {
  it("renders the Hebrew landing page with the quiz CTA and local hero image", async () => {
    const Page = (await import("../../src/app/page")).default;
    const html = renderToString(<Page />);

    expect(html).toContain("מהי הסיבה");
    expect(html).toContain("האמיתית");
    expect(html).toContain("שלא מצאת זוגיות עד היום?");
    expect(html).toContain('href="/quiz"');
    expect(html).toContain("איך זה עובד?");
    expect(html).toContain("landing-couple.png");
    expect(html).toContain("דוח אישי ודיסקרטי");
    expect(html).toContain("99");
    expect(html).toContain("ש״ח בלבד");
  });
});
