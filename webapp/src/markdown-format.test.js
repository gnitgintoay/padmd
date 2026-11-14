import { describe, expect, it } from "vitest";
import { getMarkdownFormatState, planToggleLineStyle, planToggleWrap } from "./markdown-format.js";

function apply(text, change) {
  return `${text.slice(0, change.from)}${change.insert}${text.slice(change.to)}`;
}

function applyMany(text, changes) {
  return [...changes].sort((a, b) => b.from - a.from).reduce(apply, text);
}

describe("Markdown formatting", () => {
  it("wraps only the selected text", () => {
    const plan = planToggleWrap("一段选中文字", { from: 2, to: 6 }, "**", "**");
    expect(apply("一段选中文字", plan.changes)).toBe("一段**选中文字**");
    expect(plan.selection).toEqual({ anchor: 4, head: 8 });
  });

  it("removes an existing wrapper on the second action", () => {
    const plan = planToggleWrap("一段**选中文字**", { from: 4, to: 8 }, "**", "**");
    expect(apply("一段**选中文字**", plan.changes)).toBe("一段选中文字");
    expect(plan.active).toBe(false);
  });

  it("toggles ordered lists and numbers selected lines", () => {
    const text = "甲\n乙\n丙";
    const added = planToggleLineStyle(text, { from: 0, to: text.length }, "ordered");
    const formatted = applyMany(text, added.changes);
    expect(formatted).toBe("1. 甲\n2. 乙\n3. 丙");
    const removed = planToggleLineStyle(formatted, { from: 0, to: formatted.length }, "ordered");
    expect(applyMany(formatted, removed.changes)).toBe(text);
  });

  it("treats a partial text selection as only its containing line", () => {
    const text = "第一行\n第二行";
    const plan = planToggleLineStyle(text, { from: 5, to: 6 }, "ordered");
    expect(applyMany(text, plan.changes)).toBe("第一行\n1. 第二行");
  });

  it("reports active inline and line formatting", () => {
    const text = "- **重点**";
    expect(getMarkdownFormatState(text, { from: 4, to: 6 })).toMatchObject({ bold: true, unordered: true });
  });
});
