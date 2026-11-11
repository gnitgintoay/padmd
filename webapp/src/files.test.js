import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";

import { extractMarkdownFromZip, isMarkdown } from "./files.js";

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

describe("extractMarkdownFromZip", () => {
  it("extracts every Markdown document and keeps nested categories", () => {
    const archive = zipSync({
      "课程/第一章.md": strToU8("# 第一章"),
      "课程/第二章.markdown": strToU8("# 第二章"),
      "课程/图片.png": new Uint8Array([1, 2, 3]),
    });

    const extracted = extractMarkdownFromZip(archive);
    expect(extracted).toHaveLength(2);
    expect(Object.fromEntries(extracted.map((file) => [file.path, file.content]))).toEqual({
      "课程/第一章.md": "# 第一章",
      "课程/第二章.markdown": "# 第二章",
    });
  });
});
