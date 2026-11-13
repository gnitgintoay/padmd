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
  exitFocusButton: $("#exitFocusButton"),
  themeButton: $("#themeButton"),
  themeColorMeta: $("#themeColorMeta"),
  librarySearch: $("#librarySearch"),
  libraryViewButtons: [...document.querySelectorAll("[data-library-view]")],
  libraryNotice: $("#libraryNotice"),
  libraryCount: $("#libraryCount"),
  selectionModeButton: $("#selectionModeButton"),
  batchActions: $("#batchActions"),
  selectionCount: $("#selectionCount"),
  selectAllButton: $("#selectAllButton"),
  batchMoveButton: $("#batchMoveButton"),
  batchDeleteButton: $("#batchDeleteButton"),
  documentTree: $("#documentTree"),
  newButton: $("#newButton"),
  fileButton: $("#fileButton"),
  folderButton: $("#folderButton"),
  zipButton: $("#zipButton"),
  backupAllButton: $("#backupAllButton"),
  backupStatus: $("#backupStatus"),
  welcome: $("#welcome"),
  welcomeFolderButton: $("#welcomeFolderButton"),
  welcomeFileButton: $("#welcomeFileButton"),
  editorScreen: $("#editorScreen"),
  documentName: $("#documentName"),
  saveStatus: $("#saveStatus"),
  discardButton: $("#discardButton"),
  overwriteOriginalButton: $("#overwriteOriginalButton"),
  saveCopyButton: $("#saveCopyButton"),
  singleModeButton: $("#singleModeButton"),
  compareModeButton: $("#compareModeButton"),
  focusModeButton: $("#focusModeButton"),
  outlineButton: $("#outlineButton"),
  outlinePanel: $("#outlinePanel"),
  outlineList: $("#outlineList"),
  closeOutlineButton: $("#closeOutlineButton"),
  documentInfoButton: $("#documentInfoButton"),
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
  historyDialog: $("#historyDialog"),
  historyList: $("#historyList"),
  storageDialog: $("#storageDialog"),
  storageDocumentCount: $("#storageDocumentCount"),
  storageContentSize: $("#storageContentSize"),
  storageOriginUsage: $("#storageOriginUsage"),
  storagePersistence: $("#storagePersistence"),
  storageQuota: $("#storageQuota"),
  storageLastBackup: $("#storageLastBackup"),
  requestPersistenceButton: $("#requestPersistenceButton"),
  storageBackupButton: $("#storageBackupButton"),
  importReportDialog: $("#importReportDialog"),
  importReportTitle: $("#importReportTitle"),
  importReportCount: $("#importReportCount"),
  importReportRoot: $("#importReportRoot"),
  importReportChecked: $("#importReportChecked"),
  importReportSkipped: $("#importReportSkipped"),
  importReportNote: $("#importReportNote"),
  documentInfoDialog: $("#documentInfoDialog"),
  infoName: $("#infoName"),
  infoPath: $("#infoPath"),
  infoSource: $("#infoSource"),
  infoCreatedAt: $("#infoCreatedAt"),
  infoModifiedAt: $("#infoModifiedAt"),
  infoLastOpenedAt: $("#infoLastOpenedAt"),
  infoStats: $("#infoStats"),
  infoDraftState: $("#infoDraftState"),
  infoFavorite: $("#infoFavorite"),
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
  focusMode: false,
  libraryView: "all",
  lastFullBackupAt: 0,
  collapsedFolders: new Set(),
  selectionMode: false,
  selectedDocumentIds: new Set(),
  selectedTrashIds: new Set(),
  trashOpen: false,
  toastTimer: null,
  outlineTimer: null,
  searchTimer: null,
  currentPersistedModifiedAt: 0,
};

let syncScrollOwner = null;
let editor;
let documentSyncChannel = null;
const instanceId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;

initialize().catch((error) => {
  console.error("Moyo failed to start", error);
  toast(`Moyo 启动失败：${error?.message || error}`);
});

async function initialize() {
  const editorModulePromise = import("./editor.js");
  const settingsPromise = Promise.all([
    getSetting("theme", matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"),
    getSetting("splitRatio", 0.46),
    getSetting("editorMode", "single"),
    getSetting("sidebarCollapsed", false),
    getSetting("collapsedFolders", []),
    getSetting("lastFullBackupAt", 0),
  ]);
  const { createMarkdownEditor } = await editorModulePromise;
  editor = createMarkdownEditor(elements.editor, {
    onChange: handleEditorUpdate,
    onSave: saveCopy,
  });
  // Bind controls before touching persistent storage. Some embedded WebKit
  // browsers can take a moment to open IndexedDB on their first launch.
  wireEvents();
  wireCrossTabSync();
  const [theme, splitRatio, editorMode, sidebarCollapsed, collapsedFolders, lastFullBackupAt] = await settingsPromise;
  applyTheme(theme);
  state.splitRatio = Number(splitRatio);
  state.mode = editorMode;
  state.sidebarCollapsed = Boolean(sidebarCollapsed);
  state.collapsedFolders = new Set(Array.isArray(collapsedFolders) ? collapsedFolders : []);
  state.lastFullBackupAt = Number(lastFullBackupAt) || 0;
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

  elements.librarySearch.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(renderLibrary, 120);
  });
  for (const button of elements.libraryViewButtons) {
    button.addEventListener("click", () => {
      state.libraryView = button.dataset.libraryView;
      for (const item of elements.libraryViewButtons) item.classList.toggle("is-active", item === button);
      renderLibrary();
    });
  }
  elements.selectionModeButton.addEventListener("click", () => setSelectionMode(!state.selectionMode));
  elements.selectAllButton.addEventListener("click", toggleSelectAllVisible);
  elements.batchMoveButton.addEventListener("click", batchMoveDocuments);
  elements.batchDeleteButton.addEventListener("click", batchMoveToTrash);
  elements.documentTree.addEventListener("click", (event) => {
    if (!event.target.closest(".folder-menu-button, .folder-menu-popover")) closeFolderMenus();
  });
  elements.newButton.addEventListener("click", createNewDocument);
  elements.fileButton.addEventListener("click", importFiles);
  elements.folderButton.addEventListener("click", importFolder);
  elements.zipButton.addEventListener("click", importZip);
  elements.welcomeFolderButton.addEventListener("click", importFolder);
  elements.welcomeFileButton.addEventListener("click", importFiles);
  elements.backupAllButton.addEventListener("click", createFullBackup);
  elements.backupStatus.addEventListener("click", showStorageCenter);
  elements.storageBackupButton.addEventListener("click", async () => {
    await createFullBackup();
    await showStorageCenter();
  });
  elements.requestPersistenceButton.addEventListener("click", requestPersistentStorage);

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
  elements.overwriteOriginalButton.addEventListener("click", setDraftAsOriginal);
  elements.saveCopyButton.addEventListener("click", saveCopy);
  elements.singleModeButton.addEventListener("click", () => setMode("single"));
  elements.compareModeButton.addEventListener("click", () => setMode("compare"));
  elements.focusModeButton.addEventListener("click", () => setFocusMode(true));
  elements.exitFocusButton.addEventListener("click", () => setFocusMode(false));
  elements.outlineButton.addEventListener("click", () => setOutlineOpen(elements.outlinePanel.hidden));
  elements.closeOutlineButton.addEventListener("click", () => setOutlineOpen(false));
  elements.documentInfoButton.addEventListener("click", showDocumentInfo);
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
    if (event.key === "Escape" && state.focusMode) {
      event.preventDefault();
      setFocusMode(false);
      return;
    }
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
  const trashIds = new Set(state.trashedDocuments.map((document) => document.id));
  state.selectedTrashIds = new Set([...state.selectedTrashIds].filter((id) => trashIds.has(id)));
  const availableIds = new Set(state.documents.map((document) => document.id));
  state.selectedDocumentIds = new Set(
    [...state.selectedDocumentIds].filter((id) => availableIds.has(id)),
  );
  if (!state.documents.length) state.selectionMode = false;
  elements.libraryCount.textContent = String(state.documents.length);
  updateBackupStatus(allDocuments);
  renderLibrary();
  elements.backupAllButton.disabled = state.documents.length === 0;
}

function renderLibrary() {
  const query = elements.librarySearch.value.trim().toLowerCase();
  const visible = getVisibleDocuments();
  elements.documentTree.classList.toggle("is-searching", Boolean(query));
  elements.documentTree.classList.toggle("is-contextual", state.libraryView !== "all");
  elements.documentTree.classList.toggle("is-flat-view", state.libraryView === "recent" && !query);
  updateSelectionControls(visible);
  elements.documentTree.replaceChildren();

  if (!visible.length && !state.trashedDocuments.length) {
    elements.documentTree.append(createLibraryEmptyState());
    return;
  }

  if (visible.length) {
    if (state.libraryView === "recent" && !query) {
      for (const document of visible) elements.documentTree.append(renderDocumentRow(document));
    } else {
      const root = { folders: new Map(), documents: [] };
      for (const document of visible) addDocumentToTree(root, document);
      elements.documentTree.append(renderTreeNode(root, true));
    }
  } else {
    elements.documentTree.append(createLibraryEmptyState());
  }

  if (state.trashedDocuments.length && !query && !state.selectionMode && state.libraryView === "all") elements.documentTree.append(renderTrash());
}

function getVisibleDocuments() {
  const query = elements.librarySearch.value.trim().toLowerCase();
  let documents = [...state.documents];
  if (state.libraryView === "favorites") documents = documents.filter((document) => document.favorite);
  if (state.libraryView === "recent") {
    documents = documents
      .filter((document) => document.lastOpenedAt)
      .sort((a, b) => Number(b.lastOpenedAt) - Number(a.lastOpenedAt))
      .slice(0, 20);
  }
  if (!query) return documents;
  return documents.filter((document) => {
    const haystack = `${document.name} ${document.path} ${document.draft || ""} ${document.original || ""}`.toLowerCase();
    return haystack.includes(query);
  });
}

function getDocumentSecondary(document) {
  const query = elements.librarySearch.value.trim().toLowerCase();
  const parentPath = (document.path || "").split("/").slice(0, -1).join("/") || "浏览器本地";
  if (!query && state.libraryView === "recent") {
    return { text: `${formatRelativeTime(document.lastOpenedAt)} · ${parentPath}`, match: "" };
  }
  if (!query) return { text: parentPath, match: "" };
  const content = String(document.draft ?? document.original ?? "").replace(/\s+/g, " ").trim();
  const index = content.toLowerCase().indexOf(query);
  if (index < 0) return { text: parentPath, match: parentPath.toLowerCase().includes(query) ? query : "" };
  const start = Math.max(0, index - 28);
  const end = Math.min(content.length, index + query.length + 46);
  return {
    text: `${start ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`,
    match: query,
  };
}

function highlightSearchMatch(text, query) {
  const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (index < 0) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, index))}<mark>${escapeHtml(text.slice(index, index + query.length))}</mark>${escapeHtml(text.slice(index + query.length))}`;
}

function formatRelativeTime(timestamp) {
  const elapsed = Math.max(0, Date.now() - Number(timestamp || 0));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN");
}

function setSelectionMode(enabled) {
  state.selectionMode = enabled && state.documents.length > 0;
  if (!state.selectionMode) state.selectedDocumentIds.clear();
  closeFolderMenus();
  renderLibrary();
}

function updateSelectionControls(visible = getVisibleDocuments()) {
  elements.selectionModeButton.disabled = state.documents.length === 0;
  elements.selectionModeButton.textContent = state.selectionMode ? "完成" : "选择";
  elements.selectionModeButton.setAttribute("aria-pressed", String(state.selectionMode));
  elements.batchActions.hidden = !state.selectionMode;
  const selectedCount = state.selectedDocumentIds.size;
  elements.selectionCount.textContent = `已选 ${selectedCount} 篇`;
  elements.batchDeleteButton.disabled = selectedCount === 0;
  elements.batchMoveButton.disabled = selectedCount === 0;
  const allVisibleSelected = visible.length > 0
    && visible.every((document) => state.selectedDocumentIds.has(document.id));
  elements.selectAllButton.disabled = visible.length === 0;
  elements.selectAllButton.textContent = allVisibleSelected ? "取消全选" : "全选";
}

function toggleDocumentSelection(id, row, control) {
  if (state.selectedDocumentIds.has(id)) state.selectedDocumentIds.delete(id);
  else state.selectedDocumentIds.add(id);
  const selected = state.selectedDocumentIds.has(id);
  row.classList.toggle("is-selected", selected);
  control.classList.toggle("is-checked", selected);
  control.setAttribute("aria-pressed", String(selected));
  control.textContent = selected ? "✓" : "";
  updateSelectionControls();
}

function toggleSelectAllVisible() {
  const visible = getVisibleDocuments();
  const shouldSelect = visible.some((document) => !state.selectedDocumentIds.has(document.id));
  for (const document of visible) {
    if (shouldSelect) state.selectedDocumentIds.add(document.id);
    else state.selectedDocumentIds.delete(document.id);
  }
  renderLibrary();
}

async function batchMoveDocuments() {
  const selectedIds = new Set(state.selectedDocumentIds);
  if (!selectedIds.size) return;
  await backupDraft();
  const value = await promptText(
    `移动 ${selectedIds.size} 篇文档`,
    "目标分类路径（例如：学习/课程；留空放到根目录）",
    "",
  );
  if (value === null) return;
  const category = normalizeCategory(value);
  const documents = await listDocuments();
  for (const document of documents) {
    if (!selectedIds.has(document.id)) continue;
    document.path = category ? `${category}/${document.name}` : document.name;
    document.modifiedAt = Date.now();
    await putDocument(document);
    if (state.current?.id === document.id) {
      state.current.path = document.path;
      state.current.modifiedAt = document.modifiedAt;
      state.currentPersistedModifiedAt = Number(document.modifiedAt) || 0;
      elements.folderPath.textContent = document.path;
    }
  }
  state.selectedDocumentIds.clear();
  state.selectionMode = false;
  await refreshLibrary();
  toast(category ? `已将 ${selectedIds.size} 篇文档移动到“${category}”` : `已将 ${selectedIds.size} 篇文档移动到根目录`);
}

async function batchMoveToTrash() {
  const selectedIds = new Set(state.selectedDocumentIds);
  if (!selectedIds.size) return;
  const confirmed = await confirmAction(
    `将选中的 ${selectedIds.size} 篇文档移到回收站？`,
    "这里只删除 Moyo 的浏览器本地副本，不会删除“文件”App 中的原文件。之后仍可从回收站恢复。",
    "移到回收站",
  );
  if (!confirmed) return;

  await backupDraft();
  const freshDocuments = await listDocuments();
  const now = Date.now();
  let movedCount = 0;
  for (const document of freshDocuments) {
    if (!selectedIds.has(document.id)) continue;
    document.trashed = true;
    document.modifiedAt = now;
    await putDocument(document);
    movedCount += 1;
  }
  if (state.current && selectedIds.has(state.current.id)) {
    state.current = null;
    state.needsBackup = false;
    elements.editorScreen.hidden = true;
    elements.welcome.hidden = false;
  }
  state.selectedDocumentIds.clear();
  state.selectionMode = false;
  await refreshLibrary();
  toast(`已将 ${movedCount} 篇文档移到回收站`);
}

function createLibraryEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-list";
  const query = elements.librarySearch.value.trim();
  if (query) {
    empty.innerHTML = '<span class="empty-icon">⌕</span><strong>没有找到文档</strong><span>名称、路径和正文中都没有匹配内容</span>';
  } else if (state.libraryView === "favorites") {
    empty.innerHTML = '<span class="empty-icon">☆</span><strong>还没有收藏</strong><span>从文档菜单中选择“收藏”</span>';
  } else if (state.libraryView === "recent") {
    empty.innerHTML = '<span class="empty-icon">◷</span><strong>还没有最近文档</strong><span>打开文档后会自动出现在这里</span>';
  } else {
    empty.innerHTML = '<span class="empty-icon">＋</span><strong>文档库还是空的</strong><span>新建文档，或导入已有文件夹</span>';
  }
  return empty;
}

function renderTrash() {
  const trash = document.createElement("details");
  trash.className = "trash-section";
  trash.open = state.trashOpen;
  trash.addEventListener("toggle", () => { state.trashOpen = trash.open; });
  const summary = document.createElement("summary");
  summary.textContent = `回收站（${state.trashedDocuments.length}）`;
  trash.append(summary);

  const actions = document.createElement("div");
  actions.className = "trash-actions";
  const count = document.createElement("span");
  count.textContent = `已选 ${state.selectedTrashIds.size} 篇`;
  const selectAll = document.createElement("button");
  selectAll.type = "button";
  selectAll.textContent = state.selectedTrashIds.size === state.trashedDocuments.length ? "取消全选" : "全选";
  selectAll.addEventListener("click", () => {
    if (state.selectedTrashIds.size === state.trashedDocuments.length) state.selectedTrashIds.clear();
    else state.selectedTrashIds = new Set(state.trashedDocuments.map((item) => item.id));
    renderLibrary();
  });
  const restoreSelected = document.createElement("button");
  restoreSelected.type = "button";
  restoreSelected.textContent = "恢复所选";
  restoreSelected.disabled = !state.selectedTrashIds.size;
  restoreSelected.addEventListener("click", batchRestoreTrash);
  const deleteSelected = document.createElement("button");
  deleteSelected.type = "button";
  deleteSelected.className = "danger-text";
  deleteSelected.textContent = "删除所选";
  deleteSelected.disabled = !state.selectedTrashIds.size;
  deleteSelected.addEventListener("click", batchDeleteTrash);
  actions.append(count, selectAll, restoreSelected, deleteSelected);
  trash.append(actions);

  for (const doc of state.trashedDocuments) {
    const row = document.createElement("div");
    row.className = "trash-row";
    const select = document.createElement("button");
    const selected = state.selectedTrashIds.has(doc.id);
    select.type = "button";
    select.className = `trash-select${selected ? " is-checked" : ""}`;
    select.textContent = selected ? "✓" : "";
    select.setAttribute("aria-label", `选择 ${doc.name}`);
    select.setAttribute("aria-pressed", String(selected));
    select.addEventListener("click", () => {
      if (selected) state.selectedTrashIds.delete(doc.id);
      else state.selectedTrashIds.add(doc.id);
      renderLibrary();
    });
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
    row.append(select, name, restore, remove);
    trash.append(row);
  }
  return trash;
}

async function batchRestoreTrash() {
  const ids = new Set(state.selectedTrashIds);
  for (const doc of state.trashedDocuments) {
    if (!ids.has(doc.id)) continue;
    doc.trashed = false;
    doc.modifiedAt = Date.now();
    await putDocument(doc);
  }
  state.selectedTrashIds.clear();
  await refreshLibrary();
  toast(`已恢复 ${ids.size} 篇文档`);
}

async function batchDeleteTrash() {
  const ids = new Set(state.selectedTrashIds);
  if (!ids.size) return;
  const confirmed = await confirmAction(
    `彻底删除选中的 ${ids.size} 篇文档？`,
    "此操作无法撤销，但不会删除“文件”App 中的原文件。",
    "彻底删除",
  );
  if (!confirmed) return;
  for (const id of ids) await permanentlyDeleteDocument(id);
  state.selectedTrashIds.clear();
  await refreshLibrary();
  toast(`已彻底删除 ${ids.size} 篇本地副本`);
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
  const selected = state.selectedDocumentIds.has(doc.id);
  container.className = `doc-row${state.current?.id === doc.id ? " is-active" : ""}${state.selectionMode ? " is-selecting" : ""}${selected ? " is-selected" : ""}`;
  container.dataset.documentId = doc.id;

  let selectControl = null;
  if (state.selectionMode) {
    selectControl = document.createElement("button");
    selectControl.className = `doc-select${selected ? " is-checked" : ""}`;
    selectControl.type = "button";
    selectControl.textContent = selected ? "✓" : "";
    selectControl.setAttribute("aria-label", `选择 ${doc.name}`);
    selectControl.setAttribute("aria-pressed", String(selected));
    selectControl.addEventListener("click", () => toggleDocumentSelection(doc.id, container, selectControl));
  }

  const open = document.createElement("button");
  open.className = "doc-open";
  open.type = "button";
  const dirty = doc.draft !== doc.original;
  const secondary = getDocumentSecondary(doc);
  const query = elements.librarySearch.value.trim();
  open.innerHTML = `<span class="doc-title"><span class="doc-file-icon" aria-hidden="true"></span><span class="doc-dirty"${dirty ? "" : " hidden"}>●</span><span class="doc-title-text">${highlightSearchMatch(doc.name, query)}</span><span class="doc-favorite"${doc.favorite ? "" : " hidden"} aria-label="已收藏">★</span></span><span class="doc-path">${highlightSearchMatch(secondary.text, secondary.match)}</span>`;
  open.addEventListener("click", () => {
    if (state.selectionMode) toggleDocumentSelection(doc.id, container, selectControl);
    else openDocument(doc.id, { revealQuery: elements.librarySearch.value.trim() });
  });

  if (state.selectionMode) {
    container.append(selectControl, open);
    return container;
  }

  const menu = document.createElement("details");
  menu.className = "doc-menu";
  const summary = document.createElement("summary");
  summary.textContent = "⋮";
  summary.title = "文档操作";
  const popover = document.createElement("div");
  popover.className = "doc-menu-popover";
  const menuItems = [
    ["favorite", doc.favorite ? "取消收藏" : "收藏", "★"],
    ["rename", "重命名", "✎"],
    ["category", "移动到分类", "↗"],
    ["duplicate", "创建副本", "⧉"],
    ["history", "历史版本", "◷"],
    ["delete", "移到回收站", "⌫"],
  ];
  for (const [action, label, iconText] of menuItems) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    const icon = document.createElement("span");
    icon.className = "menu-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = iconText;
    const text = document.createElement("span");
    text.textContent = label;
    button.append(icon, text);
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
    popover.style.top = `${Math.min(innerHeight - 190, rect.bottom + 4)}px`;
  });
  menu.append(summary, popover);
  container.append(open, menu);
  return container;
}

async function openDocument(id, { revealQuery = "" } = {}) {
  if (state.current?.id === id) {
    if (revealQuery) editor.revealText(revealQuery);
    toggleSidebar(false);
    return;
  }
  await backupDraft();
  const document = await getDocument(id);
  if (!document || document.trashed) return;
  document.lastOpenedAt = Date.now();
  await putDocument(document);
  state.current = document;
  state.currentPersistedModifiedAt = Number(document.modifiedAt) || 0;
  state.needsBackup = false;
  editor.setText(document.draft ?? document.original ?? "");
  elements.originalContent.textContent = document.original ?? "";
  elements.documentName.textContent = document.name;
  elements.folderPath.textContent = document.path || document.name;
  elements.welcome.hidden = true;
  elements.editorScreen.hidden = false;
  if (!elements.outlinePanel.hidden) renderOutline(document.draft ?? document.original ?? "");
  await setSetting("lastDocumentId", document.id);
  updateDocumentStatus();
  await refreshLibrary();
  toggleSidebar(false);
  requestAnimationFrame(() => {
    if (!revealQuery || !editor.revealText(revealQuery)) editor.focus();
  });
}

function handleEditorUpdate({ text, docChanged, line, column }) {
  elements.positionStatus.textContent = `第 ${line} 行，第 ${column} 列`;
  updateStats(text);
  if (!docChanged || !state.current) return;
  state.current.draft = text;
  state.current.modifiedAt = Date.now();
  const cached = state.documents.find((document) => document.id === state.current.id);
  if (cached) {
    cached.draft = text;
    cached.modifiedAt = state.current.modifiedAt;
  }
  state.needsBackup = true;
  updateDocumentStatus();
  updateCurrentDocumentDirtyMarker();
  if (!elements.outlinePanel.hidden) {
    clearTimeout(state.outlineTimer);
    state.outlineTimer = setTimeout(() => renderOutline(text), 180);
  }
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
  announceDocumentUpdate(state.current);
  state.needsBackup = false;
  updateDocumentStatus();
}

function updateDocumentStatus() {
  if (!state.current) return;
  const changed = editor.getText() !== state.current.original;
  elements.discardButton.disabled = !changed;
  elements.overwriteOriginalButton.disabled = !changed;
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
    const result = await chooseMarkdownFiles(elements.fileInput);
    if (!result.selectedCount) return;
    const imported = await importFileRecords(result.files, "file");
    if (imported.count) setLibraryNotice(`已导入 ${imported.count} 篇，放在“未分类”中；列表可上下滑动`);
    showImportReport({ title: "文件导入完成", imported: imported.count, checked: result.selectedCount, root: imported.root || "未分类" });
  } catch (error) {
    showError("导入文件失败", error);
  }
}

async function importFolder() {
  try {
    setLibraryNotice("正在读取文件夹…");
    const result = await chooseFolder(elements.folderInput);
    if (result.mode === "cancelled") return setLibraryNotice("已取消导入文件夹");
    const imported = await importFileRecords(result.files, "folder", result.root);
    if (result.mode === "flat-input") {
      setLibraryNotice(imported.count
        ? `已导入 ${imported.count} 篇。Safari 未提供原文件夹名，已统一放入“${imported.root}”`
        : "没有找到 Markdown 文档", !imported.count);
    } else {
      setLibraryNotice(`已导入文件夹“${imported.root || result.root || "Markdown"}”：${imported.count} 篇；列表可上下滑动`);
    }
    showImportReport({
      title: "文件夹导入完成",
      imported: imported.count,
      checked: result.selectedCount,
      root: imported.root || result.root || "导入文件夹",
      note: result.mode === "flat-input" ? "Safari 没有提供原文件夹名，Moyo 已建立独立分组。" : "文件夹层级已保留。",
    });
  } catch (error) {
    setLibraryNotice("文件夹读取失败，请改用 ZIP 导入。", true);
    showError("导入文件夹失败", error);
  }
}

async function importZip() {
  try {
    setLibraryNotice("正在解压 ZIP…");
    const result = await chooseZip(elements.zipInput);
    if (!result.entryCount && !result.backup) return setLibraryNotice("已取消导入 ZIP");
    if (result.backup) {
      const restored = await restoreMoyoBackup(result.backup);
      setLibraryNotice(`已恢复 Moyo 备份：${restored.count} 篇放入“${restored.root}”`);
      showImportReport({ title: "Moyo 备份恢复完成", imported: restored.count, checked: result.backup.documents.length, root: restored.root, note: "原有文档没有被覆盖。" });
      return;
    }
    const imported = await importFileRecords(result.files, "zip", result.root);
    setLibraryNotice(imported.count
      ? `已在本机解压 ZIP：${imported.count} 篇放入“${imported.root}”`
      : "ZIP 中没有 Markdown 文档", !imported.count);
    showImportReport({ title: "ZIP 导入完成", imported: imported.count, checked: result.entryCount, root: imported.root || result.root || "ZIP 文件夹", note: "ZIP 只在本机解压，没有上传。" });
  } catch (error) {
    setLibraryNotice("ZIP 读取失败，请确认压缩包未损坏。", true);
    showError("导入 ZIP 失败", error);
  }
}

async function restoreMoyoBackup(backup) {
  await backupDraft();
  const roots = new Set(state.documents.map((item) => (item.path || "").split("/")[0]));
  const date = String(backup.exportedAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const base = `Moyo 恢复 ${date}`;
  let root = base;
  let suffix = 2;
  while (roots.has(root)) root = `${base} ${suffix++}`;
  const restored = [];
  for (const record of backup.documents) {
    if (!record || typeof record.name !== "string") continue;
    const document = createDocument({
      name: record.name,
      path: `${root}/${String(record.path || record.name).replace(/^\/+/, "")}`,
      content: typeof record.original === "string" ? record.original : "",
      source: "backup-restore",
    });
    document.draft = typeof record.draft === "string" ? record.draft : document.original;
    document.history = Array.isArray(record.history) ? record.history.slice(0, 10) : [];
    document.favorite = Boolean(record.favorite);
    document.lastOpenedAt = Number(record.lastOpenedAt) || null;
    await putDocument(document);
    restored.push(document);
  }
  await refreshLibrary();
  if (restored[0]) await openDocument(restored[0].id);
  toast(`已恢复 ${restored.length} 篇文档，原有文档未被覆盖`);
  return { count: restored.length, root };
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
  setSaveStatus("已导出新的修改版副本", "exported");
  toast("已导出新副本，没有改动 Moyo 原文");
}

async function setDraftAsOriginal() {
  if (!state.current) return;
  await backupDraft();
  const nextOriginal = editor.getText();
  if (nextOriginal === state.current.original) return toast("当前修改稿已经是 Moyo 原文");
  const confirmed = await confirmAction(
    "覆盖原文？",
    "当前修改稿会成为新的原文对照和恢复基准。此操作只影响 Moyo 浏览器本地副本，不会覆盖“文件”App里的真实文件。",
    "覆盖原文",
  );
  if (!confirmed) return;

  const previousOriginal = state.current.original;
  const documentId = state.current.id;
  addHistorySnapshot(state.current, previousOriginal, "覆盖前的原文");
  state.current.original = nextOriginal;
  state.current.draft = nextOriginal;
  state.current.originalUpdatedAt = Date.now();
  state.current.modifiedAt = Date.now();
  state.needsBackup = false;
  await putDocument(state.current);
  announceDocumentUpdate(state.current);
  elements.originalContent.textContent = nextOriginal;
  updateDocumentStatus();
  renderLibrary();
  toast("已覆盖 Moyo 内部原文", {
    actionLabel: "撤销",
    persistent: true,
    onAction: async () => {
      const document = await getDocument(documentId);
      if (!document) return;
      document.original = previousOriginal;
      document.modifiedAt = Date.now();
      await putDocument(document);
      announceDocumentUpdate(document);
      if (state.current?.id === documentId) {
        state.current = document;
        elements.originalContent.textContent = previousOriginal;
        updateDocumentStatus();
      }
      renderLibrary();
      toast("已恢复上一个 Moyo 原文");
    },
  });
}

async function discardChanges() {
  if (!state.current || editor.getText() === state.current.original) return;
  const confirmed = await confirmAction("恢复原文？", "当前修改稿和恢复草稿将被清除，但导入的原始内容会保留。", "恢复原文");
  if (!confirmed) return;
  addHistorySnapshot(state.current, editor.getText(), "恢复原文前的修改稿");
  state.current.draft = state.current.original;
  state.current.modifiedAt = Date.now();
  state.needsBackup = false;
  await putDocument(state.current);
  announceDocumentUpdate(state.current);
  editor.setText(state.current.original);
  updateDocumentStatus();
  renderLibrary();
  toast("已恢复为导入时的原文");
}

function addHistorySnapshot(document, content, label) {
  if (typeof content !== "string") return;
  const history = Array.isArray(document.history) ? document.history : [];
  if (history[0]?.content === content) return;
  history.unshift({ id: crypto.randomUUID?.() || String(Date.now()), content, label, createdAt: Date.now() });
  document.history = history.slice(0, 10);
}

function showHistory(document) {
  elements.historyList.replaceChildren();
  const history = Array.isArray(document.history) ? document.history : [];
  if (!history.length) {
    const empty = window.document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "还没有历史版本。覆盖原文或恢复原文前会自动留档。";
    elements.historyList.append(empty);
  }
  for (const version of history) {
    const item = window.document.createElement("div");
    item.className = "history-item";
    const title = window.document.createElement("strong");
    title.textContent = version.label || "历史版本";
    const time = window.document.createElement("span");
    time.textContent = new Date(version.createdAt).toLocaleString("zh-CN");
    const preview = window.document.createElement("span");
    preview.className = "history-preview";
    preview.textContent = String(version.content || "").replace(/\s+/g, " ").trim().slice(0, 80) || "空白内容";
    const restore = window.document.createElement("button");
    restore.type = "button";
    restore.textContent = "恢复为修改稿";
    restore.addEventListener("click", async () => {
      elements.historyDialog.close();
      const fresh = await getDocument(document.id);
      if (!fresh) return;
      addHistorySnapshot(fresh, fresh.draft, "恢复历史版本前的修改稿");
      fresh.draft = version.content;
      fresh.modifiedAt = Date.now();
      await putDocument(fresh);
      if (state.current?.id === fresh.id) {
        state.current = fresh;
        state.needsBackup = false;
        editor.setText(fresh.draft);
        updateDocumentStatus();
      }
      await refreshLibrary();
      toast("历史版本已恢复为修改稿");
    });
    item.append(title, time, preview, restore);
    elements.historyList.append(item);
  }
  elements.historyDialog.showModal();
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
  if (action === "favorite") {
    document.favorite = !document.favorite;
    document.favoriteUpdatedAt = Date.now();
    await putDocument(document);
    if (state.current?.id === document.id) state.current.favorite = document.favorite;
    toast(document.favorite ? "已加入收藏" : "已取消收藏");
  } else if (action === "history") {
    showHistory(document);
    return;
  } else if (action === "rename") {
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

function setFocusMode(enabled) {
  state.focusMode = Boolean(enabled);
  if (state.focusMode) setOutlineOpen(false);
  elements.app.classList.toggle("focus-mode", state.focusMode);
  elements.exitFocusButton.hidden = !state.focusMode;
  if (state.focusMode) requestAnimationFrame(editor.focus);
}

function setOutlineOpen(open) {
  const visible = Boolean(open && state.current);
  elements.outlinePanel.hidden = !visible;
  elements.outlineButton.setAttribute("aria-expanded", String(visible));
  if (visible) renderOutline(editor.getText());
}

function renderOutline(text) {
  const headings = extractMarkdownHeadings(text);
  elements.outlineList.replaceChildren();
  if (!headings.length) {
    const empty = document.createElement("div");
    empty.className = "outline-empty";
    empty.textContent = "当前文档还没有标题。使用 #、## 或 ### 建立大纲。";
    elements.outlineList.append(empty);
    return;
  }
  for (const heading of headings) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "outline-item";
    button.dataset.level = String(heading.level);
    button.style.setProperty("--outline-level", String(heading.level));
    button.textContent = heading.text;
    button.title = `跳到第 ${heading.line} 行`;
    button.addEventListener("click", () => {
      editor.goToLine(heading.line);
      if (innerWidth <= 820) setOutlineOpen(false);
    });
    elements.outlineList.append(button);
  }
}

function extractMarkdownHeadings(text) {
  const headings = [];
  let fenced = false;
  String(text || "").split(/\r?\n/).forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;
    headings.push({ level: match[1].length, text: match[2], line: index + 1 });
  });
  return headings;
}

function showDocumentInfo() {
  if (!state.current) return;
  const document = state.current;
  const text = editor.getText();
  const lines = text ? text.split("\n").length : 0;
  const characters = [...text].length;
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  const sourceLabels = {
    file: "单个文件导入",
    folder: "文件夹导入",
    zip: "ZIP 导入",
    created: "Moyo 新建",
    duplicate: "Moyo 副本",
    "backup-restore": "Moyo 备份恢复",
    "flutter-migration": "旧版迁移",
  };
  elements.infoName.textContent = document.name;
  elements.infoPath.textContent = document.path || document.name;
  elements.infoSource.textContent = sourceLabels[document.source] || document.source || "本地文档";
  elements.infoCreatedAt.textContent = formatDateTime(document.createdAt);
  elements.infoModifiedAt.textContent = formatDateTime(document.modifiedAt);
  elements.infoLastOpenedAt.textContent = formatDateTime(document.lastOpenedAt);
  elements.infoStats.textContent = `${lines} 行 · ${characters} 字符 · ${words} 词`;
  elements.infoDraftState.textContent = state.needsBackup
    ? "有尚未写入恢复草稿的修改"
    : text === document.original ? "修改稿与 Moyo 原文一致" : "恢复草稿已保存在本浏览器";
  elements.infoFavorite.textContent = document.favorite ? "已收藏" : "未收藏";
  elements.documentInfoDialog.showModal();
}

function formatDateTime(timestamp) {
  return Number(timestamp) ? new Date(timestamp).toLocaleString("zh-CN") : "未记录";
}

function wireCrossTabSync() {
  if (typeof BroadcastChannel !== "function") return;
  documentSyncChannel = new BroadcastChannel("moyo-document-sync");
  documentSyncChannel.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.sender === instanceId || message.type !== "document-updated") return;
    if (!state.current || message.id !== state.current.id) return;
    if (Number(message.modifiedAt) <= state.currentPersistedModifiedAt) return;
    toast("这篇文档已在另一个窗口更新", {
      actionLabel: "重新载入",
      persistent: true,
      onAction: () => reloadDocumentFromOtherWindow(message.id),
    });
  });
}

function announceDocumentUpdate(document) {
  if (!document) return;
  if (state.current?.id === document.id) state.currentPersistedModifiedAt = Number(document.modifiedAt) || Date.now();
  documentSyncChannel?.postMessage({
    type: "document-updated",
    sender: instanceId,
    id: document.id,
    modifiedAt: Number(document.modifiedAt) || Date.now(),
  });
}

async function reloadDocumentFromOtherWindow(id) {
  if (state.needsBackup) {
    const confirmed = await confirmAction(
      "载入另一窗口的版本？",
      "当前窗口尚未写入恢复草稿的修改会被放弃。",
      "重新载入",
    );
    if (!confirmed) return;
  }
  const document = await getDocument(id);
  if (!document || document.trashed) return;
  state.current = document;
  state.currentPersistedModifiedAt = Number(document.modifiedAt) || 0;
  state.needsBackup = false;
  editor.setText(document.draft ?? document.original ?? "");
  elements.originalContent.textContent = document.original ?? "";
  elements.documentName.textContent = document.name;
  elements.folderPath.textContent = document.path || document.name;
  updateDocumentStatus();
  await refreshLibrary();
  toast("已载入另一窗口保存的版本");
}

function updateBackupStatus(documents = [...state.documents, ...state.trashedDocuments]) {
  const hasChanges = !state.lastFullBackupAt
    || documents.some((document) => Number(document.modifiedAt) > state.lastFullBackupAt);
  elements.backupStatus.dataset.state = hasChanges ? "changed" : "safe";
  if (hasChanges) elements.backupStatus.textContent = state.lastFullBackupAt ? "备份后有变更" : "尚未完整备份";
  else elements.backupStatus.textContent = `已备份 ${new Date(state.lastFullBackupAt).toLocaleDateString("zh-CN")}`;
}

async function createFullBackup() {
  if (!state.documents.length) return toast("当前没有可备份的文档");
  downloadBackup(state.documents);
  state.lastFullBackupAt = Date.now();
  await setSetting("lastFullBackupAt", state.lastFullBackupAt);
  updateBackupStatus();
  toast("已生成全部文档 ZIP 备份");
}

async function showStorageCenter() {
  const documents = [...state.documents, ...state.trashedDocuments];
  const contentBytes = new Blob([JSON.stringify(documents)]).size;
  elements.storageDocumentCount.textContent = String(documents.length);
  elements.storageContentSize.textContent = formatBytes(contentBytes);
  elements.storageLastBackup.textContent = state.lastFullBackupAt
    ? new Date(state.lastFullBackupAt).toLocaleString("zh-CN")
    : "尚未备份";

  let persisted = false;
  try {
    const estimate = await navigator.storage?.estimate?.();
    elements.storageOriginUsage.textContent = Number.isFinite(estimate?.usage) ? formatBytes(estimate.usage) : "未知";
    elements.storageQuota.textContent = Number.isFinite(estimate?.quota) ? formatBytes(estimate.quota) : "由浏览器管理";
    persisted = Boolean(await navigator.storage?.persisted?.());
    elements.storagePersistence.textContent = persisted ? "已获得持久存储保护" : "由浏览器自动管理";
  } catch (error) {
    console.warn("Unable to inspect browser storage", error);
    elements.storageOriginUsage.textContent = "未知";
    elements.storageQuota.textContent = "由浏览器管理";
    elements.storagePersistence.textContent = "无法读取浏览器状态";
  }
  elements.requestPersistenceButton.hidden = persisted || typeof navigator.storage?.persist !== "function";
  if (!elements.storageDialog.open) elements.storageDialog.showModal();
}

async function requestPersistentStorage() {
  try {
    const granted = await navigator.storage?.persist?.();
    toast(granted ? "浏览器已加强 Moyo 的本地存储保护" : "浏览器暂未授予持久存储，请保持定期备份");
  } catch (error) {
    showError("无法申请持久存储", error);
  }
  await showStorageCenter();
}

function showImportReport({ title, imported, checked, root, note = "" }) {
  const skipped = Math.max(0, Number(checked || 0) - Number(imported || 0));
  elements.importReportTitle.textContent = title;
  elements.importReportCount.textContent = String(imported || 0);
  elements.importReportRoot.textContent = root || "未建立分组";
  elements.importReportChecked.textContent = `${checked || 0} 个`;
  elements.importReportSkipped.textContent = skipped ? `${skipped} 个（非 Markdown 或无法读取）` : "0 个";
  elements.importReportNote.textContent = note || "导入的是浏览器本地副本，不会修改来源文件。";
  elements.importReportDialog.showModal();
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / (1024 ** index);
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
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
