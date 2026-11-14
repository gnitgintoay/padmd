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
import { getMarkdownFormatState, planToggleLineStyle, planToggleWrap } from "./markdown-format.js";

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
              toggleWrap("**", "**");
              return true;
            },
          },
          {
            key: "Mod-i",
            preventDefault: true,
            run: () => {
              toggleWrap("*", "*");
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
              text: update.docChanged ? update.state.doc.toString() : null,
              docChanged: update.docChanged,
              line: line.number,
              column: head - line.from + 1,
              formatting: getCurrentFormatting(update.state),
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
    onChange({ text, docChanged: false, line: 1, column: 1, formatting: getCurrentFormatting(view.state) });
  }

  function getText() {
    return view.state.doc.toString();
  }

  function getSelection() {
    const { anchor, head, from, to } = view.state.selection.main;
    return { anchor, head, from, to };
  }

  function getCurrentFormatting(state = view.state) {
    const selection = state.selection.main;
    const line = state.doc.lineAt(selection.head);
    const localFrom = Math.max(0, selection.from - 16);
    const localTo = Math.min(state.doc.length, selection.to + 32);
    const localText = state.sliceDoc(localFrom, localTo);
    const localSelection = {
      anchor: selection.anchor - localFrom,
      head: selection.head - localFrom,
    };
    const inline = getMarkdownFormatState(localText, localSelection);
    const lineState = getMarkdownFormatState(line.text, {
      anchor: Math.max(0, selection.anchor - line.from),
      head: Math.max(0, selection.head - line.from),
    });
    return { ...inline, ...Object.fromEntries(["heading", "unordered", "ordered", "task", "quote"].map((key) => [key, lineState[key]])) };
  }

  function toggleWrap(before, after, selection = getSelection()) {
    const plan = planToggleWrap(view.state.doc.toString(), selection, before, after);
    view.dispatch({
      changes: plan.changes,
      selection: EditorSelection.range(plan.selection.anchor, plan.selection.head),
      scrollIntoView: true,
    });
    view.focus();
  }

  function toggleLineStyle(style, selection = getSelection()) {
    const plan = planToggleLineStyle(view.state.doc.toString(), selection, style);
    const changes = view.state.changes(plan.changes);
    const mappedSelection = selection.anchor === selection.head
      ? EditorSelection.cursor(changes.mapPos(selection.anchor, 1))
      : EditorSelection.range(
        changes.mapPos(selection.anchor, selection.anchor < selection.head ? 1 : -1),
        changes.mapPos(selection.head, selection.anchor < selection.head ? -1 : 1),
      );
    view.dispatch({
      changes,
      selection: mappedSelection,
      scrollIntoView: true,
    });
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
    getSelection,
    getFormatting: getCurrentFormatting,
    toggleWrap,
    toggleLineStyle,
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
