import { describe, expect, it } from "vitest";

import { getCookieDomain } from "./routes";

describe("getCookieDomain", () => {
  it.each([
    ["https://app.camox.ai", ".camox.ai"],
    ["https://camox.ai", ".camox.ai"],
    ["http://localhost:3274", undefined],
    ["not a url", undefined],
    ["", undefined],
  ])("maps %s to %s", (siteUrl, expected) => {
    expect(getCookieDomain(siteUrl)).toBe(expected);
  });
});
