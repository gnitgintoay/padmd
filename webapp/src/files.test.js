import { describe, expect, it } from "vitest";

import { isMarkdown } from "./files.js";

describe("isMarkdown", () => {
  it("accepts common Markdown extensions case-insensitively", () => {
    expect(isMarkdown("notes.md")).toBe(true);
    expect(isMarkdown("README.MD")).toBe(true);
    expect(isMarkdown("book.markdown")).toBe(true);
    expect(isMarkdown("draft.mdown")).toBe(true);
  });

  it("rejects unrelated files", () => {
    expect(isMarkdown("photo.png")).toBe(false);
    expect(isMarkdown("notes.txt")).toBe(false);
  });
});
