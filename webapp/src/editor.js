import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { bracketMatching, defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { openSearchPanel, searchKeymap } from "@codemirror/search";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  ViewPlugin,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

const padmdMarkdownStyle = HighlightStyle.define([
  { tag: tags.strong, fontWeight: "750" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.heading, fontWeight: "750" },
]);

const highlightText = Decoration.mark({ class: "cm-padmd-highlight" });
const highlightMark = Decoration.mark({ class: "cm-padmd-highlight-mark" });

function findHighlights(view) {
  const ranges = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    const pattern = /==([^=\n](?:.*?[^=\n])?)==/g;
    for (const match of text.matchAll(pattern)) {
      const start = from + match.index;
      const end = start + match[0].length;
      ranges.push(highlightMark.range(start, start + 2));
      ranges.push(highlightText.range(start + 2, end - 2));
      ranges.push(highlightMark.range(end - 2, end));
    }
  }
  return Decoration.set(ranges, true);
}

const markdownHighlights = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = findHighlights(view); }
    update(update) {
      if (update.docChanged || update.viewportChanged) this.decorations = findHighlights(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

export function createMarkdownEditor(parent, { onChange, onSave }) {
  let suppressChange = false;

  const buildState = (text) =>
    EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        bracketMatching(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        EditorView.lineWrapping,
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        syntaxHighlighting(padmdMarkdownStyle),
        markdownHighlights,
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              onSave();
              return true;
            },
          },
          {
            key: "Mod-b",
            preventDefault: true,
            run: () => {
              wrap("**", "**");
              return true;
            },
          },
          {
            key: "Mod-i",
            preventDefault: true,
            run: () => {
              wrap("*", "*");
              return true;
            },
          },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (suppressChange) return;
          if (update.docChanged || update.selectionSet) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            onChange({
              text: update.state.doc.toString(),
              docChanged: update.docChanged,
              line: line.number,
              column: head - line.from + 1,
            });
          }
        }),
      ],
    });

  const view = new EditorView({ state: buildState(""), parent });

  function setText(text) {
    suppressChange = true;
    view.setState(buildState(text));
    suppressChange = false;
    onChange({ text, docChanged: false, line: 1, column: 1 });
  }

  function getText() {
    return view.state.doc.toString();
  }

  function wrap(before, after) {
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to);
    const insert = `${before}${selected}${after}`;
    const cursor = selected
      ? EditorSelection.range(selection.from + before.length, selection.to + before.length)
      : EditorSelection.cursor(selection.from + before.length);
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: cursor,
      scrollIntoView: true,
    });
    view.focus();
  }

  function prefixLines(prefix) {
    const selection = view.state.selection.main;
    const firstLine = view.state.doc.lineAt(selection.from);
    const lastLine = view.state.doc.lineAt(selection.to);
    const changes = [];
    for (let number = firstLine.number; number <= lastLine.number; number += 1) {
      changes.push({ from: view.state.doc.line(number).from, insert: prefix });
    }
    view.dispatch({ changes, scrollIntoView: true });
    view.focus();
  }

  function goToLine(lineNumber) {
    const number = Math.max(1, Math.min(Number(lineNumber) || 1, view.state.doc.lines));
    const position = view.state.doc.line(number).from;
    view.dispatch({ selection: EditorSelection.cursor(position), scrollIntoView: true });
    view.focus();
  }

  function revealText(query) {
    const needle = String(query || "").trim();
    if (!needle) return false;
    const content = view.state.doc.toString();
    const from = content.toLowerCase().indexOf(needle.toLowerCase());
    if (from < 0) return false;
    view.dispatch({
      selection: EditorSelection.range(from, from + needle.length),
      scrollIntoView: true,
    });
    view.focus();
    return true;
  }

  return {
    view,
    setText,
    getText,
    wrap,
    prefixLines,
    goToLine,
    revealText,
    undo: () => undo(view),
    redo: () => redo(view),
    find: () => {
      openSearchPanel(view);
      view.focus();
    },
    focus: () => view.focus(),
  };
}
