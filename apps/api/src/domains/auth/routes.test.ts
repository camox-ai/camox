import { describe, expect, it } from "vitest";

import { getCookieDomain } from "./routes";

describe("getCookieDomain", () => {
  it.each([
    ["https://api.camox.dev", ".camox.dev"],
    ["https://app.camox.dev", ".camox.dev"],
    ["https://camox.dev", ".camox.dev"],
    ["http://localhost:3274", undefined],
    ["not a url", undefined],
    ["", undefined],
  ])("maps %s to %s", (siteUrl, expected) => {
    expect(getCookieDomain(siteUrl)).toBe(expected);
  });
});
