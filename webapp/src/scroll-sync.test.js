import { describe, expect, it } from "vitest";

import { calculateSyncedScrollTop } from "./scroll-sync.js";

describe("calculateSyncedScrollTop", () => {
  it("uses the same pixel position when original and draft are identical", () => {
    expect(calculateSyncedScrollTop({
      sourceTop: 420,
      sourceRange: 1200,
      targetRange: 1210,
      sameContent: true,
    })).toBe(420);
  });

  it("uses proportional progress after the draft structure changes", () => {
    expect(calculateSyncedScrollTop({
      sourceTop: 300,
      sourceRange: 1200,
      targetRange: 800,
      sameContent: false,
    })).toBe(200);
  });

  it("clamps an identical document position to the target range", () => {
    expect(calculateSyncedScrollTop({
      sourceTop: 900,
      sourceRange: 1000,
      targetRange: 850,
      sameContent: true,
    })).toBe(850);
  });
});
