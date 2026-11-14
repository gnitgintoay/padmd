const LINE_STYLES = {
  heading: { pattern: /^#{1,6}\s+/, marker: () => "# " },
  unordered: { pattern: /^[-+*]\s+(?!\[[ xX]\]\s+)/, marker: () => "- " },
  ordered: { pattern: /^\d+[.)]\s+/, marker: (index) => `${index + 1}. ` },
  task: { pattern: /^[-+*]\s+\[[ xX]\]\s+/, marker: () => "- [ ] " },
  quote: { pattern: /^>\s?/, marker: () => "> " },
};

function clampSelection(text, selection) {
  const length = text.length;
  const anchor = Math.max(0, Math.min(Number(selection?.anchor ?? selection?.from) || 0, length));
  const head = Math.max(0, Math.min(Number(selection?.head ?? selection?.to) || anchor, length));
  return { anchor, head, from: Math.min(anchor, head), to: Math.max(anchor, head) };
}

export function planToggleWrap(text, selection, before, after) {
  const range = clampSelection(text, selection);
  const selected = text.slice(range.from, range.to);
  const includesMarkers = selected.length >= before.length + after.length
    && selected.startsWith(before)
    && selected.endsWith(after);
  if (includesMarkers) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return {
      changes: { from: range.from, to: range.to, insert: inner },
      selection: { anchor: range.from, head: range.from + inner.length },
      active: false,
    };
  }

  const surrounded = range.from >= before.length
    && text.slice(range.from - before.length, range.from) === before
    && text.slice(range.to, range.to + after.length) === after;
  if (surrounded) {
    return {
      changes: { from: range.from - before.length, to: range.to + after.length, insert: selected },
      selection: {
        anchor: range.from - before.length,
        head: range.from - before.length + selected.length,
      },
      active: false,
    };
  }

  return {
    changes: { from: range.from, to: range.to, insert: `${before}${selected}${after}` },
    selection: selected
      ? { anchor: range.from + before.length, head: range.to + before.length }
      : { anchor: range.from + before.length, head: range.from + before.length },
    active: true,
  };
}

function lineRanges(text) {
  const ranges = [];
  let from = 0;
  for (const part of text.split("\n")) {
    ranges.push({ from, to: from + part.length, text: part });
    from += part.length + 1;
  }
  return ranges;
}

export function planToggleLineStyle(text, selection, styleName) {
  const style = LINE_STYLES[styleName];
  if (!style) throw new Error(`Unknown Markdown line style: ${styleName}`);
  const range = clampSelection(text, selection);
  const effectiveTo = range.to > range.from && text[range.to - 1] === "\n" ? range.to - 1 : range.to;
  const selectedLines = lineRanges(text).filter((line) => line.to >= range.from && line.from <= effectiveTo);
  const remove = selectedLines.length > 0 && selectedLines.every((line) => style.pattern.test(line.text));
  const changes = selectedLines.map((line, index) => {
    const match = line.text.match(style.pattern);
    if (remove) return { from: line.from, to: line.from + match[0].length, insert: "" };
    const marker = style.marker(index);
    if (match) return { from: line.from, to: line.from + match[0].length, insert: marker };
    return { from: line.from, to: line.from, insert: marker };
  });
  return { changes, active: !remove };
}

export function getMarkdownFormatState(text, selection) {
  const range = clampSelection(text, selection);
  const selected = text.slice(range.from, range.to);
  const hasWrap = (before, after) => (
    (selected.length >= before.length + after.length && selected.startsWith(before) && selected.endsWith(after))
    || (range.from >= before.length
      && text.slice(range.from - before.length, range.from) === before
      && text.slice(range.to, range.to + after.length) === after)
  );
  const line = lineRanges(text).find((item) => item.from <= range.head && item.to >= range.head)
    || lineRanges(text).at(-1);
  const bold = hasWrap("**", "**");
  const italic = !bold && hasWrap("*", "*");
  return {
    bold,
    italic,
    highlight: hasWrap("==", "=="),
    inlineCode: hasWrap("`", "`"),
    codeBlock: hasWrap("```\n", "\n```"),
    link: hasWrap("[", "](https://)"),
    heading: LINE_STYLES.heading.pattern.test(line?.text || ""),
    unordered: LINE_STYLES.unordered.pattern.test(line?.text || ""),
    ordered: LINE_STYLES.ordered.pattern.test(line?.text || ""),
    task: LINE_STYLES.task.pattern.test(line?.text || ""),
    quote: LINE_STYLES.quote.pattern.test(line?.text || ""),
  };
}
