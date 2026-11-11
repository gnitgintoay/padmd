import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { openSearchPanel, searchKeymap } from "@codemirror/search";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";

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

  return {
    view,
    setText,
    getText,
    wrap,
    prefixLines,
    undo: () => undo(view),
    redo: () => redo(view),
    find: () => {
      openSearchPanel(view);
      view.focus();
    },
    focus: () => view.focus(),
  };
}
