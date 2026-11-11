import "./styles.css";
import { registerSW } from "virtual:pwa-register";

import {
  createDocument,
  ensureMarkdownExtension,
  getDocument,
  getSetting,
  listDocuments,
  migrateFlutterDocuments,
  permanentlyDeleteDocument,
  putDocument,
  setSetting,
} from "./db.js";
import { createMarkdownEditor } from "./editor.js";
import {
  chooseFolder,
  chooseMarkdownFiles,
  chooseZip,
  downloadBackup,
  downloadMarkdown,
} from "./files.js";

const $ = (selector) => document.querySelector(selector);

const elements = {
  app: $("#app"),
  sidebar: $("#sidebar"),
  sidebarScrim: $("#sidebarScrim"),
  sidebarButton: $("#sidebarButton"),
  sidebarCollapseButton: $("#sidebarCollapseButton"),
  sidebarRailButton: $("#sidebarRailButton"),
  themeButton: $("#themeButton"),
  librarySearch: $("#librarySearch"),
  libraryNotice: $("#libraryNotice"),
  documentTree: $("#documentTree"),
  newButton: $("#newButton"),
  fileButton: $("#fileButton"),
  folderButton: $("#folderButton"),
  zipButton: $("#zipButton"),
  backupAllButton: $("#backupAllButton"),
  welcome: $("#welcome"),
  welcomeFolderButton: $("#welcomeFolderButton"),
  welcomeFileButton: $("#welcomeFileButton"),
  editorScreen: $("#editorScreen"),
  documentName: $("#documentName"),
  saveStatus: $("#saveStatus"),
  discardButton: $("#discardButton"),
  saveCopyButton: $("#saveCopyButton"),
  singleModeButton: $("#singleModeButton"),
  compareModeButton: $("#compareModeButton"),
  folderPath: $("#folderPath"),
  workspace: $("#workspace"),
  originalContent: $("#originalContent"),
  splitGutter: $("#splitGutter"),
  formatToolbar: $("#formatToolbar"),
  findButton: $("#findButton"),
  undoButton: $("#undoButton"),
  redoButton: $("#redoButton"),
  positionStatus: $("#positionStatus"),
  documentStats: $("#documentStats"),
  editor: $("#editor"),
  fileInput: $("#fileInput"),
  folderInput: $("#folderInput"),
  zipInput: $("#zipInput"),
  renameDialog: $("#renameDialog"),
  renameInput: $("#renameInput"),
  confirmDialog: $("#confirmDialog"),
  confirmTitle: $("#confirmTitle"),
  confirmMessage: $("#confirmMessage"),
  toast: $("#toast"),
};

const state = {
  documents: [],
  trashedDocuments: [],
  current: null,
  needsBackup: false,
  mode: "single",
  splitRatio: 0.46,
  sidebarCollapsed: false,
  toastTimer: null,
};

let syncScrollOwner = null;

const editor = createMarkdownEditor(elements.editor, {
  onChange: handleEditorUpdate,
  onSave: saveCopy,
});

initialize().catch((error) => {
  console.error("PadMD failed to start", error);
  toast(`PadMD 启动失败：${error?.message || error}`);
});

async function initialize() {
  // Bind controls before touching persistent storage. Some embedded WebKit
  // browsers can take a moment to open IndexedDB on their first launch.
  wireEvents();
  const [theme, splitRatio, editorMode, sidebarCollapsed] = await Promise.all([
    getSetting("theme", matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"),
    getSetting("splitRatio", 0.46),
    getSetting("editorMode", "single"),
    getSetting("sidebarCollapsed", false),
  ]);
  applyTheme(theme);
  state.splitRatio = Number(splitRatio);
  state.mode = editorMode;
  state.sidebarCollapsed = Boolean(sidebarCollapsed);
  applySplitRatio(state.splitRatio);
  applyMode(state.mode);
  applySidebarCollapsed(state.sidebarCollapsed);

  const migrated = await migrateFlutterDocuments();
  await refreshLibrary();
  if (migrated) toast(`已从旧版 PadMD 迁移 ${migrated} 个文档`);

  const lastId = await getSetting("lastDocumentId", null);
  const initial = state.documents.find((item) => item.id === lastId) || state.documents[0];
  if (initial) await openDocument(initial.id);

  registerSW({
    immediate: true,
    onNeedRefresh() {
      toast("PadMD 已更新，下次打开将使用新版本");
    },
  });
}

function wireEvents() {
  elements.themeButton.addEventListener("click", async () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next);
    await setSetting("theme", next);
  });

  elements.librarySearch.addEventListener("input", renderLibrary);
  elements.newButton.addEventListener("click", createNewDocument);
  elements.fileButton.addEventListener("click", importFiles);
  elements.folderButton.addEventListener("click", importFolder);
  elements.zipButton.addEventListener("click", importZip);
  elements.welcomeFolderButton.addEventListener("click", importFolder);
  elements.welcomeFileButton.addEventListener("click", importFiles);
  elements.backupAllButton.addEventListener("click", () => {
    if (!state.documents.length) return toast("当前没有可备份的文档");
    downloadBackup(state.documents);
    toast("已生成全部文档 ZIP 备份");
  });

  elements.sidebarButton.addEventListener("click", () => toggleSidebar(true));
  elements.sidebarRailButton.addEventListener("click", () => {
    if (innerWidth <= 820) toggleSidebar(true);
    else setSidebarCollapsed(false);
  });
  elements.sidebarCollapseButton.addEventListener("click", () => {
    if (innerWidth <= 820) toggleSidebar(false);
    else setSidebarCollapsed(true);
  });
  elements.sidebarScrim.addEventListener("click", () => toggleSidebar(false));
  elements.documentName.addEventListener("click", renameCurrentDocument);
  elements.discardButton.addEventListener("click", discardChanges);
  elements.saveCopyButton.addEventListener("click", saveCopy);
  elements.singleModeButton.addEventListener("click", () => setMode("single"));
  elements.compareModeButton.addEventListener("click", () => setMode("compare"));
  elements.findButton.addEventListener("click", editor.find);
  elements.undoButton.addEventListener("click", editor.undo);
  elements.redoButton.addEventListener("click", editor.redo);

  elements.formatToolbar.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.wrap) {
      const [before, after] = button.dataset.wrap.split("|").map((value) => value.replaceAll("\\n", "\n"));
      editor.wrap(before, after);
    } else if (button.dataset.prefix) {
      editor.prefixLines(button.dataset.prefix);
    }
  });

  wireResizableSplit();
  wireSynchronizedScroll();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") backupDraft();
  });
  window.addEventListener("pagehide", backupDraft);
  window.addEventListener("keydown", (event) => {
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier) return;
    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      createNewDocument();
    } else if (event.key.toLowerCase() === "o") {
      event.preventDefault();
      importFiles();
    }
  });

  setInterval(backupDraft, 20_000);
}

async function refreshLibrary() {
  const allDocuments = await listDocuments({ includeTrashed: true });
  state.documents = allDocuments.filter((document) => !document.trashed);
  state.trashedDocuments = allDocuments.filter((document) => document.trashed);
  renderLibrary();
  elements.backupAllButton.disabled = state.documents.length === 0;
}

function renderLibrary() {
  const query = elements.librarySearch.value.trim().toLowerCase();
  const visible = state.documents.filter((document) => {
    const haystack = `${document.name} ${document.path}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  elements.documentTree.replaceChildren();

  if (!visible.length && !state.trashedDocuments.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = state.documents.length ? "没有匹配的文档" : "还没有文档";
    elements.documentTree.append(empty);
    return;
  }

  if (visible.length) {
    const root = { folders: new Map(), documents: [] };
    for (const document of visible) addDocumentToTree(root, document);
    elements.documentTree.append(renderTreeNode(root, true));
  } else {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "没有匹配的文档";
    elements.documentTree.append(empty);
  }

  if (state.trashedDocuments.length && !query) elements.documentTree.append(renderTrash());
}

function renderTrash() {
  const trash = document.createElement("details");
  trash.className = "trash-section";
  const summary = document.createElement("summary");
  summary.textContent = `回收站（${state.trashedDocuments.length}）`;
  trash.append(summary);

  for (const doc of state.trashedDocuments) {
    const row = document.createElement("div");
    row.className = "trash-row";
    const name = document.createElement("span");
    name.textContent = doc.name;
    name.title = doc.path;
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = "恢复";
    restore.addEventListener("click", async () => {
      doc.trashed = false;
      doc.modifiedAt = Date.now();
      await putDocument(doc);
      await refreshLibrary();
      toast("文档已恢复");
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-text";
    remove.textContent = "彻底删除";
    remove.addEventListener("click", async () => {
      const confirmed = await confirmAction(
        "彻底删除本地副本？",
        "此操作无法撤销，但不会删除“文件”App 中的原文件。",
        "彻底删除",
      );
      if (!confirmed) return;
      await permanentlyDeleteDocument(doc.id);
      await refreshLibrary();
      toast("本地副本已彻底删除");
    });
    row.append(name, restore, remove);
    trash.append(row);
  }
  return trash;
}

function addDocumentToTree(root, document) {
  const parts = (document.path || document.name).split("/").filter(Boolean);
  let node = root;
  for (const folder of parts.slice(0, -1)) {
    if (!node.folders.has(folder)) node.folders.set(folder, { folders: new Map(), documents: [] });
    node = node.folders.get(folder);
  }
  node.documents.push(document);
}

function renderTreeNode(node, isRoot = false) {
  const fragment = document.createDocumentFragment();
  const folders = [...node.folders.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN", { numeric: true }));
  for (const [name, child] of folders) {
    const details = document.createElement("details");
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = name;
    details.append(summary, renderTreeNode(child));
    fragment.append(details);
  }
  node.documents
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }))
    .forEach((document) => fragment.append(renderDocumentRow(document, isRoot)));
  return fragment;
}

function renderDocumentRow(doc) {
  const container = document.createElement("div");
  container.className = `doc-row${state.current?.id === doc.id ? " is-active" : ""}`;

  const open = document.createElement("button");
  open.className = "doc-open";
  open.type = "button";
  const dirty = doc.draft !== doc.original;
  const parentPath = (doc.path || "").split("/").slice(0, -1).join("/");
  open.innerHTML = `<span class="doc-title">${dirty ? '<span class="doc-dirty">●</span>' : ""}${escapeHtml(doc.name)}</span><span class="doc-path">${escapeHtml(parentPath || "浏览器本地")}</span>`;
  open.addEventListener("click", () => openDocument(doc.id));

  const menu = document.createElement("details");
  menu.className = "doc-menu";
  const summary = document.createElement("summary");
  summary.textContent = "⋮";
  summary.title = "文档操作";
  const popover = document.createElement("div");
  popover.className = "doc-menu-popover";
  for (const [action, label] of [["rename", "重命名"], ["duplicate", "创建副本"], ["delete", "移到回收站"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = label;
    button.addEventListener("click", async () => {
      menu.open = false;
      await handleDocumentAction(doc, action);
    });
    popover.append(button);
  }
  menu.addEventListener("toggle", () => {
    if (!menu.open) return;
    document.querySelectorAll(".doc-menu[open]").forEach((other) => {
      if (other !== menu) other.open = false;
    });
    const rect = summary.getBoundingClientRect();
    popover.style.left = `${Math.max(8, rect.right - 145)}px`;
    popover.style.top = `${Math.min(innerHeight - 130, rect.bottom + 4)}px`;
  });
  menu.append(summary, popover);
  container.append(open, menu);
  return container;
}

async function openDocument(id) {
  if (state.current?.id === id) return;
  await backupDraft();
  const document = await getDocument(id);
  if (!document || document.trashed) return;
  state.current = document;
  state.needsBackup = false;
  editor.setText(document.draft ?? document.original ?? "");
  elements.originalContent.textContent = document.original ?? "";
  elements.documentName.textContent = document.name;
  elements.folderPath.textContent = document.path || document.name;
  elements.welcome.hidden = true;
  elements.editorScreen.hidden = false;
  await setSetting("lastDocumentId", document.id);
  updateDocumentStatus();
  renderLibrary();
  toggleSidebar(false);
  requestAnimationFrame(editor.focus);
}

function handleEditorUpdate({ text, docChanged, line, column }) {
  elements.positionStatus.textContent = `第 ${line} 行，第 ${column} 列`;
  updateStats(text);
  if (!docChanged || !state.current) return;
  state.current.draft = text;
  state.current.modifiedAt = Date.now();
  state.needsBackup = true;
  updateDocumentStatus();
  renderLibrary();
}

async function backupDraft() {
  if (!state.current || !state.needsBackup) return;
  elements.saveStatus.textContent = "正在备份恢复草稿…";
  state.current.draft = editor.getText();
  state.current.modifiedAt = Date.now();
  await putDocument(state.current);
  state.needsBackup = false;
  updateDocumentStatus();
}

function updateDocumentStatus() {
  if (!state.current) return;
  const changed = editor.getText() !== state.current.original;
  elements.discardButton.disabled = !changed;
  if (!changed) elements.saveStatus.textContent = "未修改";
  else if (state.needsBackup) elements.saveStatus.textContent = "有未备份的修改";
  else elements.saveStatus.textContent = "恢复草稿已备份（未覆盖原文件）";
}

function updateStats(text) {
  const lines = text ? text.split("\n").length : 0;
  const characters = [...text].length;
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  elements.documentStats.textContent = `${lines} 行 · ${characters} 字符 · ${words} 词`;
}

async function createNewDocument() {
  await backupDraft();
  const document = createDocument({
    name: "未命名文档.md",
    content: "# 未命名文档\n\n开始写作…\n",
    source: "created",
  });
  await putDocument(document);
  await refreshLibrary();
  await openDocument(document.id);
}

async function importFiles() {
  try {
    const files = await chooseMarkdownFiles(elements.fileInput);
    await importFileRecords(files, "file");
  } catch (error) {
    showError("导入文件失败", error);
  }
}

async function importFolder() {
  try {
    setLibraryNotice("正在读取文件夹…");
    const result = await chooseFolder(elements.folderInput);
    if (result.mode === "flat-input") {
      setLibraryNotice("当前 Safari 没有提供完整文件夹路径。请升级 iPadOS，或把文件夹压缩成 ZIP 后导入。", true);
    } else if (result.mode !== "cancelled") {
      setLibraryNotice(`已读取文件夹“${result.root || "Markdown"}”`);
    }
    await importFileRecords(result.files, "folder");
  } catch (error) {
    setLibraryNotice("文件夹读取失败，请改用 ZIP 导入。", true);
    showError("导入文件夹失败", error);
  }
}

async function importZip() {
  try {
    setLibraryNotice("正在解压 ZIP…");
    const files = await chooseZip(elements.zipInput);
    setLibraryNotice(files.length ? `已从 ZIP 读取 ${files.length} 个 Markdown 文档` : "ZIP 中没有 Markdown 文档", !files.length);
    await importFileRecords(files, "zip");
  } catch (error) {
    setLibraryNotice("ZIP 读取失败，请确认压缩包未损坏。", true);
    showError("导入 ZIP 失败", error);
  }
}

async function importFileRecords(files, source) {
  if (!files?.length) return;
  await backupDraft();
  const imported = [];
  for (const file of files) {
    const document = createDocument({ name: file.name, path: file.path, content: file.content, source });
    await putDocument(document);
    imported.push(document);
  }
  await refreshLibrary();
  await openDocument(imported[0].id);
  toast(`已复制 ${imported.length} 个 Markdown 文档，不会修改原文件`);
}

async function saveCopy() {
  if (!state.current) return;
  await backupDraft();
  downloadMarkdown(state.current, editor.getText());
  state.current.exportedAt = Date.now();
  await putDocument(state.current);
  elements.saveStatus.textContent = "已保存副本";
  toast("已生成修改版副本，没有覆盖原文件");
}

async function discardChanges() {
  if (!state.current || editor.getText() === state.current.original) return;
  const confirmed = await confirmAction("恢复原文？", "当前修改稿和恢复草稿将被清除，但导入的原始内容会保留。", "恢复原文");
  if (!confirmed) return;
  state.current.draft = state.current.original;
  state.current.modifiedAt = Date.now();
  state.needsBackup = false;
  await putDocument(state.current);
  editor.setText(state.current.original);
  updateDocumentStatus();
  renderLibrary();
  toast("已恢复为导入时的原文");
}

async function renameCurrentDocument() {
  if (!state.current) return;
  const name = await promptRename(state.current.name);
  if (!name) return;
  const oldName = state.current.name;
  state.current.name = ensureMarkdownExtension(name);
  const parts = state.current.path.split("/");
  if (parts.at(-1) === oldName) parts[parts.length - 1] = state.current.name;
  state.current.path = parts.join("/");
  state.current.modifiedAt = Date.now();
  await putDocument(state.current);
  elements.documentName.textContent = state.current.name;
  elements.folderPath.textContent = state.current.path;
  await refreshLibrary();
}

async function handleDocumentAction(document, action) {
  if (action === "rename") {
    const name = await promptRename(document.name);
    if (!name) return;
    const oldName = document.name;
    document.name = ensureMarkdownExtension(name);
    const parts = document.path.split("/");
    if (parts.at(-1) === oldName) parts[parts.length - 1] = document.name;
    document.path = parts.join("/");
    document.modifiedAt = Date.now();
    await putDocument(document);
  } else if (action === "duplicate") {
    const stem = document.name.replace(/\.(?:md|markdown|mdown|mkd)$/i, "");
    const copy = createDocument({
      name: `${stem}-副本.md`,
      path: `${stem}-副本.md`,
      content: document.draft,
      source: "duplicate",
    });
    await putDocument(copy);
    toast("已创建文档副本");
  } else if (action === "delete") {
    const confirmed = await confirmAction("移到回收站？", "这里只影响 PadMD 的浏览器本地副本，不会删除“文件”App中的原文件。", "移到回收站");
    if (!confirmed) return;
    document.trashed = true;
    document.modifiedAt = Date.now();
    await putDocument(document);
    if (state.current?.id === document.id) {
      state.current = null;
      elements.editorScreen.hidden = true;
      elements.welcome.hidden = false;
    }
    toast("已移到回收站");
  }
  await refreshLibrary();
}

async function promptRename(currentName) {
  elements.renameInput.value = currentName;
  elements.renameDialog.showModal();
  requestAnimationFrame(() => elements.renameInput.select());
  const result = await waitForDialog(elements.renameDialog);
  return result === "confirm" ? elements.renameInput.value.trim() : null;
}

async function confirmAction(title, message, confirmLabel) {
  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.confirmDialog.querySelector('[value="confirm"]').textContent = confirmLabel;
  elements.confirmDialog.showModal();
  return (await waitForDialog(elements.confirmDialog)) === "confirm";
}

function waitForDialog(dialog) {
  return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true }));
}

async function setMode(mode) {
  // A layout change may make CodeMirror adjust its own scroll position. It is
  // not a user scroll and must never start cross-pane synchronization.
  syncScrollOwner = null;
  state.mode = mode;
  applyMode(mode);
  await setSetting("editorMode", mode);
}

function applyMode(mode) {
  const compare = mode === "compare";
  elements.workspace.classList.toggle("is-single", !compare);
  elements.singleModeButton.classList.toggle("is-active", !compare);
  elements.compareModeButton.classList.toggle("is-active", compare);
}

function wireResizableSplit() {
  let dragging = false;
  const move = (event) => {
    if (!dragging) return;
    const bounds = elements.workspace.getBoundingClientRect();
    const vertical = innerWidth <= 820;
    const position = vertical ? event.clientY - bounds.top : event.clientX - bounds.left;
    const size = vertical ? bounds.height : bounds.width;
    applySplitRatio(Math.min(0.75, Math.max(0.25, position / size)));
  };
  const finish = async () => {
    if (!dragging) return;
    dragging = false;
    elements.splitGutter.classList.remove("is-dragging");
    await setSetting("splitRatio", state.splitRatio);
  };
  elements.splitGutter.addEventListener("pointerdown", (event) => {
    dragging = true;
    elements.splitGutter.classList.add("is-dragging");
    elements.splitGutter.setPointerCapture(event.pointerId);
  });
  elements.splitGutter.addEventListener("pointermove", move);
  elements.splitGutter.addEventListener("pointerup", finish);
  elements.splitGutter.addEventListener("pointercancel", finish);
  elements.splitGutter.addEventListener("dblclick", async () => {
    applySplitRatio(0.5);
    await setSetting("splitRatio", 0.5);
  });
  elements.splitGutter.addEventListener("keydown", async (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const decrease = event.key === "ArrowLeft" || event.key === "ArrowUp";
    applySplitRatio(Math.min(0.75, Math.max(0.25, state.splitRatio + (decrease ? -0.05 : 0.05))));
    await setSetting("splitRatio", state.splitRatio);
  });
}

function applySplitRatio(value) {
  state.splitRatio = Number.isFinite(value) ? value : 0.46;
  document.documentElement.style.setProperty("--split-ratio", `${state.splitRatio * 100}%`);
  elements.splitGutter.setAttribute("aria-valuenow", String(Math.round(state.splitRatio * 100)));
}

function wireSynchronizedScroll() {
  const editScroller = elements.editor.querySelector(".cm-scroller");
  const sync = (source, target) => {
    if (syncScrollOwner !== source || state.mode !== "compare") return;
    const sourceRange = source.scrollHeight - source.clientHeight;
    const targetRange = target.scrollHeight - target.clientHeight;
    if (sourceRange <= 0 || targetRange <= 0) return;
    const next = (source.scrollTop / sourceRange) * targetRange;
    if (Math.abs(target.scrollTop - next) > 1) target.scrollTop = next;
  };

  const claim = (scroller) => { syncScrollOwner = scroller; };
  for (const scroller of [editScroller, elements.originalContent]) {
    scroller.addEventListener("pointerdown", () => claim(scroller), { passive: true });
    scroller.addEventListener("touchstart", () => claim(scroller), { passive: true });
    scroller.addEventListener("wheel", () => claim(scroller), { passive: true });
    scroller.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) claim(scroller);
    });
  }
  editScroller.addEventListener("scroll", () => sync(editScroller, elements.originalContent), { passive: true });
  elements.originalContent.addEventListener("scroll", () => sync(elements.originalContent, editScroller), { passive: true });
}

async function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = collapsed;
  applySidebarCollapsed(collapsed);
  await setSetting("sidebarCollapsed", collapsed);
}

function applySidebarCollapsed(collapsed) {
  elements.app.classList.toggle("sidebar-collapsed", collapsed);
  elements.sidebarRailButton.setAttribute("aria-expanded", String(!collapsed));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  elements.themeButton.textContent = theme === "light" ? "◑" : "◐";
}

function toggleSidebar(open) {
  elements.app.classList.toggle("sidebar-open", open);
  elements.sidebarScrim.hidden = !open;
}

function setLibraryNotice(message, warning = false) {
  elements.libraryNotice.textContent = message;
  elements.libraryNotice.classList.toggle("is-warning", warning);
}

function toast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

function showError(prefix, error) {
  console.error(prefix, error);
  toast(`${prefix}：${error?.message || error}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}
