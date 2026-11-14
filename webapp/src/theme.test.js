import { describe, expect, it } from "vitest";

import { normalizeTheme } from "./theme.js";

describe("normalizeTheme", () => {
  it("keeps the two supported themes", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
  });

  it("migrates removed or invalid themes to warm dark", () => {
    expect(normalizeTheme("midnight")).toBe("dark");
    expect(normalizeTheme("unknown")).toBe("dark");
    expect(normalizeTheme(null)).toBe("dark");
  });
});
