import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";

import { extractMarkdownFromZip, groupImportedFiles, isMarkdown } from "./files.js";

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

describe("groupImportedFiles", () => {
  it("keeps the real selected folder as the top-level group", () => {
    const result = groupImportedFiles([
      { name: "一.md", path: "科研笔记/一.md", content: "" },
      { name: "二.md", path: "科研笔记/章节/二.md", content: "" },
    ]);

    expect(result.root).toBe("科研笔记");
    expect(result.files.map((file) => file.path)).toEqual([
      "科研笔记/一.md",
      "科研笔记/章节/二.md",
    ]);
  });

  it("wraps Safari's flat folder selection in a distinct folder", () => {
    const result = groupImportedFiles(
      [
        { name: "一.md", path: "一.md", content: "" },
        { name: "二.md", path: "二.md", content: "" },
      ],
      { fallbackRoot: "导入文件夹", existingRoots: ["未分类", "导入文件夹"] },
    );

    expect(result.root).toBe("导入文件夹 2");
    expect(result.files.map((file) => file.path)).toEqual([
      "导入文件夹 2/一.md",
      "导入文件夹 2/二.md",
    ]);
  });

  it("wraps root-level ZIP documents under the archive name", () => {
    const result = groupImportedFiles(
      [{ name: "说明.md", path: "说明.md", content: "" }],
      { preferredRoot: "项目资料" },
    );

    expect(result.root).toBe("项目资料");
    expect(result.files[0].path).toBe("项目资料/说明.md");
  });
});
