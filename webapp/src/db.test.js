import { describe, expect, it } from "vitest";

import { createDocument, ensureMarkdownExtension } from "./db.js";

describe("documents", () => {
  it("adds an extension only when needed", () => {
    expect(ensureMarkdownExtension("笔记")).toBe("笔记.md");
    expect(ensureMarkdownExtension("README.MD")).toBe("README.MD");
  });

  it("keeps original and draft separate", () => {
    const document = createDocument({ name: "test.md", content: "original" });
    document.draft = "edited";
    expect(document.original).toBe("original");
    expect(document.draft).toBe("edited");
  });

  it("starts a newly imported document with character-identical original and draft text", () => {
    const content = "# 标题\n\n第一段。\n\n第二段包含  空格与标点！\n";
    const document = createDocument({ name: "完整文稿.md", content });
    expect(document.original).toBe(content);
    expect(document.draft).toBe(content);
    expect(document.draft).toBe(document.original);
  });
});
