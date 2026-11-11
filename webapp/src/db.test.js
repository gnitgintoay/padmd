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
});
