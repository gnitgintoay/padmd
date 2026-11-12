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
  groupImportedFiles,
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
  themeColorMeta: $("#themeColorMeta"),
  librarySearch: $("#librarySearch"),
  libraryNotice: $("#libraryNotice"),
  libraryCount: $("#libraryCount"),
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
  textPromptTitle: $("#textPromptTitle"),
  textPromptLabel: $("#textPromptLabel"),
  renameInput: $("#renameInput"),
  confirmDialog: $("#confirmDialog"),
  confirmTitle: $("#confirmTitle"),
  confirmMessage: $("#confirmMessage"),
  toast: $("#toast"),
  toastMessage: $("#toastMessage"),
  toastAction: $("#toastAction"),
};

const state = {
  documents: [],
  trashedDocuments: [],
  current: null,
  needsBackup: false,
  mode: "single",
  splitRatio: 0.46,
  sidebarCollapsed: false,
  collapsedFolders: new Set(),
  toastTimer: null,
};

let syncScrollOwner = null;

const editor = createMarkdownEditor(elements.editor, {
  onChange: handleEditorUpdate,
  onSave: saveCopy,
});

initialize().catch((error) => {
  console.error("Moyo failed to start", error);
  toast(`Moyo 启动失败：${error?.message || error}`);
});

async function initialize() {
  // Bind controls before touching persistent storage. Some embedded WebKit
  // browsers can take a moment to open IndexedDB on their first launch.
  wireEvents();
  const [theme, splitRatio, editorMode, sidebarCollapsed, collapsedFolders] = await Promise.all([
    getSetting("theme", matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"),
    getSetting("splitRatio", 0.46),
    getSetting("editorMode", "single"),
    getSetting("sidebarCollapsed", false),
    getSetting("collapsedFolders", []),
  ]);
  applyTheme(theme);
  state.splitRatio = Number(splitRatio);
  state.mode = editorMode;
  state.sidebarCollapsed = Boolean(sidebarCollapsed);
  state.collapsedFolders = new Set(Array.isArray(collapsedFolders) ? collapsedFolders : []);
  applySplitRatio(state.splitRatio);
  applyMode(state.mode);
  applySidebarCollapsed(state.sidebarCollapsed);

  const migrated = await migrateFlutterDocuments();
  const regrouped = await repairLegacyLooseDocuments();
  await refreshLibrary();
  if (migrated) toast(`已从旧版 PadMD 迁移 ${migrated} 个文档`);
  if (regrouped) toast(`已重新整理 ${regrouped} 篇旧版散列文档`);

  const lastId = await getSetting("lastDocumentId", null);
  const initial = state.documents.find((item) => item.id === lastId) || state.documents[0];
  if (initial) await openDocument(initial.id);

  let updateSW = () => Promise.resolve();
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast("Moyo 有新版本可用", {
        actionLabel: "立即刷新",
        persistent: true,
        onAction: () => updateSW(true),
      });
    },
  });
}

async function repairLegacyLooseDocuments() {
  const documents = await listDocuments({ includeTrashed: true });
  const legacyRoots = {
    file: "未分类",
    folder: "此前导入的文件夹",
    zip: "此前导入的 ZIP",
    "flutter-migration": "旧版文档",
  };
  const looseDocuments = documents.filter((document) =>
    legacyRoots[document.source] && !(document.path || "").includes("/"));
  for (const document of looseDocuments) {
    document.path = `${legacyRoots[document.source]}/${document.name}`;
    await putDocument(document);
  }
  return looseDocuments.length;
}

function wireEvents() {
  elements.themeButton.addEventListener("click", async () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next);
    await setSetting("theme", next);
  });

  elements.librarySearch.addEventListener("input", renderLibrary);
  elements.documentTree.addEventListener("click", (event) => {
    if (!event.target.closest(".folder-menu-button, .folder-menu-popover")) closeFolderMenus();
  });
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
  elements.libraryCount.textContent = String(state.documents.length);
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
    elements.documentTree.append(createLibraryEmptyState(Boolean(state.documents.length)));
    return;
  }

  if (visible.length) {
    const root = { folders: new Map(), documents: [] };
    for (const document of visible) addDocumentToTree(root, document);
    elements.documentTree.append(renderTreeNode(root, true));
  } else {
    elements.documentTree.append(createLibraryEmptyState(true));
  }

  if (state.trashedDocuments.length && !query) elements.documentTree.append(renderTrash());
}

function createLibraryEmptyState(isSearchResult) {
  const empty = document.createElement("div");
  empty.className = "empty-list";
  empty.innerHTML = isSearchResult
    ? '<span class="empty-icon">⌕</span><strong>没有找到文档</strong><span>换一个名称或路径试试</span>'
    : '<span class="empty-icon">＋</span><strong>文档库还是空的</strong><span>新建文档，或导入已有文件夹</span>';
  return empty;
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

function renderTreeNode(node, isRoot = false, parentPath = "") {
  const fragment = document.createDocumentFragment();
  const folders = [...node.folders.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN", { numeric: true }));
  for (const [name, child] of folders) {
    const folderPath = parentPath ? `${parentPath}/${name}` : name;
    const details = document.createElement("details");
    details.className = "folder-node";
    details.open = !state.collapsedFolders.has(folderPath);
    const summary = document.createElement("summary");
    const icon = document.createElement("span");
    icon.className = "folder-icon";
    icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l1.7 2h9.3v8.8a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7V7.5Z"/><path d="M3.5 7.5V5.7A1.7 1.7 0 0 1 5.2 4h4.1l1.8 2h7.7a1.7 1.7 0 0 1 1.7 1.7v1.8"/></svg>';
    const label = document.createElement("span");
    label.className = "folder-name";
    label.textContent = name === "未分类" ? "未分类 · 单独导入" : name;
    label.title = folderPath;
    const count = document.createElement("span");
    count.className = "folder-count";
    count.textContent = String(countTreeDocuments(child));
    const menuButton = document.createElement("button");
    menuButton.className = "folder-menu-button";
    menuButton.type = "button";
    menuButton.textContent = "⋮";
    menuButton.title = `管理文件夹“${name}”`;
    menuButton.setAttribute("aria-label", `管理文件夹“${name}”`);
    const popover = createFolderMenu(folderPath, menuButton);
    menuButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFolderMenu(popover, menuButton);
    });
    summary.append(icon, label, count, menuButton);
    wireFolderLongPress(summary, popover, menuButton);
    details.addEventListener("toggle", () => {
      if (details.open) state.collapsedFolders.delete(folderPath);
      else state.collapsedFolders.add(folderPath);
      setSetting("collapsedFolders", [...state.collapsedFolders]);
    });
    details.append(summary, popover, renderTreeNode(child, false, folderPath));
    fragment.append(details);
  }
  node.documents
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }))
    .forEach((document) => fragment.append(renderDocumentRow(document, isRoot)));
  return fragment;
}

function createFolderMenu(folderPath, anchor) {
  const popover = document.createElement("div");
  popover.className = "folder-menu-popover";
  popover.hidden = true;
  for (const [action, label] of [
    ["new", "在此新建文档"],
    ["rename", "重命名文件夹"],
    ["move", "移动文件夹"],
    ["delete", "移到回收站"],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = label;
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      popover.hidden = true;
      await handleFolderAction(folderPath, action);
    });
    popover.append(button);
  }
  popover.addEventListener("click", (event) => event.stopPropagation());
  anchor.setAttribute("aria-expanded", "false");
  return popover;
}

function toggleFolderMenu(popover, anchor, forceOpen = null) {
  const shouldOpen = forceOpen ?? popover.hidden;
  closeFolderMenus();
  if (!shouldOpen) return;
  popover.hidden = false;
  anchor.setAttribute("aria-expanded", "true");
  const rect = anchor.getBoundingClientRect();
  popover.style.left = `${Math.max(8, rect.right - 166)}px`;
  popover.style.top = `${Math.min(innerHeight - 178, rect.bottom + 4)}px`;
}

function closeFolderMenus() {
  document.querySelectorAll(".folder-menu-popover:not([hidden])").forEach((menu) => {
    menu.hidden = true;
    menu.parentElement?.querySelector(".folder-menu-button")?.setAttribute("aria-expanded", "false");
  });
}

function wireFolderLongPress(summary, popover, anchor) {
  let timer = null;
  let openedByLongPress = false;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  summary.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    openedByLongPress = false;
    timer = setTimeout(() => {
      openedByLongPress = true;
      toggleFolderMenu(popover, anchor, true);
    }, 520);
  });
  summary.addEventListener("pointerup", cancel);
  summary.addEventListener("pointermove", cancel);
  summary.addEventListener("pointercancel", cancel);
  summary.addEventListener("pointerleave", cancel);
  summary.addEventListener("click", (event) => {
    if (!openedByLongPress) return;
    event.preventDefault();
    event.stopPropagation();
    openedByLongPress = false;
  });
}

function countTreeDocuments(node) {
  let count = node.documents.length;
  for (const child of node.folders.values()) count += countTreeDocuments(child);
  return count;
}

function renderDocumentRow(doc) {
  const container = document.createElement("div");
  container.className = `doc-row${state.current?.id === doc.id ? " is-active" : ""}`;
  container.dataset.documentId = doc.id;

  const open = document.createElement("button");
  open.className = "doc-open";
  open.type = "button";
  const dirty = doc.draft !== doc.original;
  const parentPath = (doc.path || "").split("/").slice(0, -1).join("/");
  open.innerHTML = `<span class="doc-title"><span class="doc-file-icon" aria-hidden="true"></span><span class="doc-dirty"${dirty ? "" : " hidden"}>●</span><span class="doc-title-text">${escapeHtml(doc.name)}</span></span><span class="doc-path">${escapeHtml(parentPath || "浏览器本地")}</span>`;
  open.addEventListener("click", () => openDocument(doc.id));

  const menu = document.createElement("details");
  menu.className = "doc-menu";
  const summary = document.createElement("summary");
  summary.textContent = "⋮";
  summary.title = "文档操作";
  const popover = document.createElement("div");
  popover.className = "doc-menu-popover";
  for (const [action, label] of [["rename", "重命名"], ["category", "移动到分类"], ["duplicate", "创建副本"], ["delete", "移到回收站"]]) {
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
  updateCurrentDocumentDirtyMarker();
}

function updateCurrentDocumentDirtyMarker() {
  if (!state.current) return;
  const row = [...elements.documentTree.querySelectorAll(".doc-row")]
    .find((item) => item.dataset.documentId === state.current.id);
  const marker = row?.querySelector(".doc-dirty");
  if (marker) marker.hidden = state.current.draft === state.current.original;
}

async function backupDraft() {
  if (!state.current || !state.needsBackup) return;
  setSaveStatus("正在备份恢复草稿…", "saving");
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
  if (!changed) setSaveStatus("未修改", "clean");
  else if (state.needsBackup) setSaveStatus("有未备份的修改", "pending");
  else setSaveStatus("恢复草稿已备份（未覆盖原文件）", "backed-up");
}

function setSaveStatus(text, status) {
  elements.saveStatus.textContent = text;
  elements.saveStatus.dataset.state = status;
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
    path: "我的文档/未命名文档.md",
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
    const imported = await importFileRecords(files, "file");
    if (imported.count) setLibraryNotice(`已导入 ${imported.count} 篇，放在“未分类”中；列表可上下滑动`);
  } catch (error) {
    showError("导入文件失败", error);
  }
}

async function importFolder() {
  try {
    setLibraryNotice("正在读取文件夹…");
    const result = await chooseFolder(elements.folderInput);
    const imported = await importFileRecords(result.files, "folder", result.root);
    if (result.mode === "flat-input") {
      setLibraryNotice(imported.count
        ? `已导入 ${imported.count} 篇。Safari 未提供原文件夹名，已统一放入“${imported.root}”`
        : "没有找到 Markdown 文档", !imported.count);
    } else if (result.mode !== "cancelled") {
      setLibraryNotice(`已导入文件夹“${imported.root || result.root || "Markdown"}”：${imported.count} 篇；列表可上下滑动`);
    }
  } catch (error) {
    setLibraryNotice("文件夹读取失败，请改用 ZIP 导入。", true);
    showError("导入文件夹失败", error);
  }
}

async function importZip() {
  try {
    setLibraryNotice("正在解压 ZIP…");
    const result = await chooseZip(elements.zipInput);
    const imported = await importFileRecords(result.files, "zip", result.root);
    setLibraryNotice(imported.count
      ? `已在本机解压 ZIP：${imported.count} 篇放入“${imported.root}”`
      : "ZIP 中没有 Markdown 文档", !imported.count);
  } catch (error) {
    setLibraryNotice("ZIP 读取失败，请确认压缩包未损坏。", true);
    showError("导入 ZIP 失败", error);
  }
}

async function importFileRecords(files, source, preferredRoot = "") {
  if (!files?.length) return { count: 0, root: "" };
  await backupDraft();
  const existingRoots = state.documents
    .map((document) => (document.path || "").split("/")[0])
    .filter(Boolean);
  const organized = source === "file"
    ? { root: "未分类", files: files.map((file) => ({ ...file, path: `未分类/${file.name}` })) }
    : groupImportedFiles(files, {
        preferredRoot,
        fallbackRoot: source === "zip" ? "ZIP 文件夹" : "导入文件夹",
        existingRoots,
      });
  const imported = [];
  const importBatchId = source === "file" ? null : (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  for (const file of organized.files) {
    const document = createDocument({ name: file.name, path: file.path, content: file.content, source });
    if (importBatchId) {
      document.importBatchId = importBatchId;
      document.importRoot = organized.root;
    }
    await putDocument(document);
    imported.push(document);
  }
  await refreshLibrary();
  await openDocument(imported[0].id);
  toast(`已复制 ${imported.length} 个 Markdown 文档，不会修改原文件`);
  return { count: imported.length, root: organized.root };
}

async function saveCopy() {
  if (!state.current) return;
  await backupDraft();
  downloadMarkdown(state.current, editor.getText());
  state.current.exportedAt = Date.now();
  await putDocument(state.current);
  setSaveStatus("已保存修改版副本", "exported");
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
  await backupDraft();
  document = await getDocument(document.id) || document;
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
    if (state.current?.id === document.id) {
      state.current = document;
      elements.documentName.textContent = document.name;
      elements.folderPath.textContent = document.path;
    }
  } else if (action === "category") {
    const currentCategory = document.path.split("/").slice(0, -1).join("/");
    const value = await promptText("移动到分类", "分类路径（例如：学习/课程；留空放到根目录）", currentCategory);
    if (value === null) return;
    const category = normalizeCategory(value);
    document.path = category ? `${category}/${document.name}` : document.name;
    document.modifiedAt = Date.now();
    await putDocument(document);
    if (state.current?.id === document.id) {
      state.current.path = document.path;
      elements.folderPath.textContent = document.path;
    }
    toast(category ? `已移动到“${category}”` : "已移动到根目录");
  } else if (action === "duplicate") {
    const stem = document.name.replace(/\.(?:md|markdown|mdown|mkd)$/i, "");
    const copyName = `${stem}-副本.md`;
    const category = document.path.split("/").slice(0, -1).join("/");
    const copy = createDocument({
      name: copyName,
      path: category ? `${category}/${copyName}` : copyName,
      content: document.draft,
      source: "duplicate",
    });
    await putDocument(copy);
    toast("已创建文档副本");
  } else if (action === "delete") {
    const confirmed = await confirmAction("移到回收站？", "这里只影响 Moyo 的浏览器本地副本，不会删除“文件”App中的原文件。", "移到回收站");
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

async function handleFolderAction(folderPath, action) {
  const documents = state.documents.filter((document) => document.path.startsWith(`${folderPath}/`));
  if (!documents.length) return;
  const folderName = folderPath.split("/").at(-1);
  const parentPath = folderPath.split("/").slice(0, -1).join("/");

  if (action === "new") {
    await backupDraft();
    const usedPaths = new Set(state.documents.map((document) => document.path.toLowerCase()));
    let name = "未命名文档.md";
    let suffix = 2;
    while (usedPaths.has(`${folderPath}/${name}`.toLowerCase())) name = `未命名文档 ${suffix++}.md`;
    const created = createDocument({
      name,
      path: `${folderPath}/${name}`,
      content: "# 未命名文档\n\n开始写作…\n",
      source: "created",
    });
    await putDocument(created);
    state.collapsedFolders.delete(folderPath);
    await setSetting("collapsedFolders", [...state.collapsedFolders]);
    await refreshLibrary();
    await openDocument(created.id);
    toast(`已在“${folderName}”中新建文档`);
    return;
  }

  if (action === "rename") {
    const value = await promptText("重命名文件夹", "新的文件夹名称", folderName);
    if (value === null) return;
    const normalized = normalizeCategory(value);
    if (!normalized || normalized.includes("/")) return toast("文件夹名称不能包含斜杠");
    const nextPath = parentPath ? `${parentPath}/${normalized}` : normalized;
    if (nextPath === folderPath) return;
    if (!await confirmFolderMerge(folderPath, nextPath)) return;
    await relocateFolder(folderPath, nextPath, `文件夹已重命名为“${normalized}”`);
    return;
  }

  if (action === "move") {
    const value = await promptText("移动文件夹", "目标上级文件夹（留空移动到根目录）", parentPath);
    if (value === null) return;
    const targetParent = normalizeCategory(value);
    if (targetParent === folderPath || targetParent.startsWith(`${folderPath}/`)) {
      return toast("不能把文件夹移动到它自己内部");
    }
    const nextPath = targetParent ? `${targetParent}/${folderName}` : folderName;
    if (nextPath === folderPath) return;
    if (!await confirmFolderMerge(folderPath, nextPath)) return;
    await relocateFolder(folderPath, nextPath, targetParent ? `文件夹已移动到“${targetParent}”` : "文件夹已移动到根目录");
    return;
  }

  if (action === "delete") {
    const confirmed = await confirmAction(
      `将“${folderName}”移到回收站？`,
      `其中 ${documents.length} 篇文档会进入 Moyo 回收站，不会删除“文件”App 中的原文件。`,
      "移到回收站",
    );
    if (!confirmed) return;
    await backupDraft();
    const freshDocuments = (await listDocuments()).filter((document) => document.path.startsWith(`${folderPath}/`));
    const affectedIds = new Set(freshDocuments.map((document) => document.id));
    for (const document of freshDocuments) {
      document.trashed = true;
      document.modifiedAt = Date.now();
      await putDocument(document);
    }
    if (state.current && affectedIds.has(state.current.id)) {
      state.current = null;
      elements.editorScreen.hidden = true;
      elements.welcome.hidden = false;
    }
    await refreshLibrary();
    toast(`“${folderName}”中的 ${freshDocuments.length} 篇文档已移到回收站`);
  }
}

async function confirmFolderMerge(oldPath, nextPath) {
  const conflicts = state.documents.some((document) =>
    !document.path.startsWith(`${oldPath}/`) && document.path.startsWith(`${nextPath}/`));
  if (!conflicts) return true;
  return confirmAction(
    "合并同名文件夹？",
    `“${nextPath}”已经存在。继续后两个文件夹的内容会显示在一起，文档内容不会被覆盖。`,
    "合并",
  );
}

async function relocateFolder(oldPath, nextPath, message) {
  await backupDraft();
  const affected = (await listDocuments()).filter((document) => document.path.startsWith(`${oldPath}/`));
  const now = Date.now();
  for (const document of affected) {
    document.path = `${nextPath}${document.path.slice(oldPath.length)}`;
    document.modifiedAt = now;
    await putDocument(document);
    if (state.current?.id === document.id) {
      state.current.path = document.path;
      elements.folderPath.textContent = document.path;
    }
  }
  state.collapsedFolders = new Set([...state.collapsedFolders].map((path) =>
    path === oldPath || path.startsWith(`${oldPath}/`) ? `${nextPath}${path.slice(oldPath.length)}` : path));
  await setSetting("collapsedFolders", [...state.collapsedFolders]);
  await refreshLibrary();
  toast(message);
}

async function promptRename(currentName) {
  return promptText("重命名文档", "文件名", currentName);
}

async function promptText(title, label, currentValue) {
  elements.textPromptTitle.textContent = title;
  elements.textPromptLabel.textContent = label;
  elements.renameInput.value = currentValue;
  elements.renameDialog.showModal();
  requestAnimationFrame(() => elements.renameInput.select());
  const result = await waitForDialog(elements.renameDialog);
  return result === "confirm" ? elements.renameInput.value.trim() : null;
}

function normalizeCategory(value) {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
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
  elements.themeColorMeta.content = theme === "light" ? "#fff9f0" : "#221b18";
  elements.themeButton.title = theme === "light" ? "切换到夜间模式" : "切换到日间模式";
  elements.themeButton.setAttribute("aria-label", elements.themeButton.title);
}

function toggleSidebar(open) {
  elements.app.classList.toggle("sidebar-open", open);
  elements.sidebarScrim.hidden = !open;
}

function setLibraryNotice(message, warning = false) {
  elements.libraryNotice.textContent = message;
  elements.libraryNotice.classList.toggle("is-warning", warning);
}

function toast(message, { actionLabel = "", onAction = null, persistent = false } = {}) {
  clearTimeout(state.toastTimer);
  elements.toastMessage.textContent = message;
  elements.toastAction.hidden = !actionLabel;
  elements.toastAction.textContent = actionLabel;
  elements.toastAction.onclick = actionLabel
    ? async () => {
        elements.toastAction.disabled = true;
        try {
          await onAction?.();
        } finally {
          elements.toastAction.disabled = false;
        }
      }
    : null;
  elements.toast.classList.add("is-visible");
  if (!persistent) state.toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

function showError(prefix, error) {
  console.error(prefix, error);
  toast(`${prefix}：${error?.message || error}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}
