/*
 * Folder-picker fallback and recursive traversal are adapted from the design of
 * techjewel/mdread (MIT). Moyo stores imported text as a safe browser-local
 * copy and never writes to the chosen source folder automatically.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const MARKDOWN_PATTERN = /\.(?:md|markdown|mdown|mkd)$/i;

export function isMarkdown(name) {
  return MARKDOWN_PATTERN.test(name);
}

export async function chooseFolder(folderInput) {
  if ("showDirectoryPicker" in window) {
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      return { files: await walkDirectoryHandle(handle), mode: "directory-handle", root: handle.name };
    } catch (error) {
      if (error?.name !== "AbortError") console.warn(error);
      return { files: [], mode: "cancelled", root: "" };
    }
  }

  const selected = await chooseInputFiles(folderInput);
  const markdown = selected.filter((file) => isMarkdown(file.name));
  const hasRelativePaths = markdown.some((file) => file.webkitRelativePath?.includes("/"));
  const files = await Promise.all(
    markdown.map(async (file) => ({
      name: file.name,
      path: normalizePath(file.webkitRelativePath || file.name),
      content: await file.text(),
    })),
  );
  return {
    files,
    mode: hasRelativePaths ? "directory-input" : "flat-input",
    root: hasRelativePaths ? files[0]?.path.split("/")[0] || "" : "",
  };
}

export async function chooseMarkdownFiles(fileInput) {
  const selected = await chooseInputFiles(fileInput);
  return Promise.all(
    selected.filter((file) => isMarkdown(file.name)).map(async (file) => ({
      name: file.name,
      path: file.name,
      content: await file.text(),
    })),
  );
}

export async function chooseZip(zipInput) {
  const [file] = await chooseInputFiles(zipInput);
  if (!file) return { files: [], root: "", backup: null };
  const packageData = readZipPackage(new Uint8Array(await file.arrayBuffer()));
  return {
    ...packageData,
    root: file.name.replace(/\.zip$/i, "") || "ZIP 文件夹",
  };
}

export function groupImportedFiles(files, { preferredRoot = "", fallbackRoot = "导入文件夹", existingRoots = [] } = {}) {
  const normalizedFiles = (files || []).map((file) => ({
    ...file,
    path: normalizePath(file.path || file.name).replace(/^\/+|\/+$/g, ""),
  }));
  if (!normalizedFiles.length) return { files: [], root: "" };

  const topLevels = new Set(
    normalizedFiles
      .filter((file) => file.path.includes("/"))
      .map((file) => file.path.split("/")[0]),
  );
  const everyFileHasFolders = normalizedFiles.every((file) => file.path.includes("/"));
  const sharedRoot = everyFileHasFolders && topLevels.size === 1 ? [...topLevels][0] : "";
  const requestedRoot = normalizeFolderName(sharedRoot || preferredRoot) || normalizeFolderName(fallbackRoot) || "导入文件夹";
  const usedRoots = new Set(existingRoots.map(normalizeFolderName).filter(Boolean));
  let root = requestedRoot;
  let suffix = 2;
  while (usedRoots.has(root)) root = `${requestedRoot} ${suffix++}`;

  if (sharedRoot) {
    return {
      root,
      files: normalizedFiles.map((file) => ({
        ...file,
        path: `${root}${file.path.slice(sharedRoot.length)}`,
      })),
    };
  }

  return {
    root,
    files: normalizedFiles.map((file) => ({ ...file, path: `${root}/${file.path}` })),
  };
}

export function extractMarkdownFromZip(bytes) {
  const archive = unzipSync(bytes);
  return extractMarkdownFromArchive(archive);
}

function extractMarkdownFromArchive(archive) {
  const files = [];
  for (const [path, bytes] of Object.entries(archive)) {
    if (!isMarkdown(path) || path.endsWith("/")) continue;
    const normalized = normalizePath(path);
    files.push({
      name: normalized.split("/").pop(),
      path: normalized,
      content: strFromU8(bytes),
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path, "zh-CN", { numeric: true }));
}

export function readZipPackage(bytes) {
  const archive = unzipSync(bytes);
  let backup = null;
  const manifestBytes = archive[".moyo/backup.json"];
  if (manifestBytes) {
    try {
      const parsed = JSON.parse(strFromU8(manifestBytes));
      if (parsed?.format === "moyo-backup" && Array.isArray(parsed.documents)) backup = parsed;
    } catch (error) {
      console.warn("Ignoring damaged Moyo backup manifest", error);
    }
  }
  return { files: extractMarkdownFromArchive(archive), backup };
}

export function downloadMarkdown(document, content) {
  const stem = document.name.replace(/\.(?:md|markdown|mdown|mkd)$/i, "");
  downloadBlob(new Blob([content], { type: "text/markdown;charset=utf-8" }), `${stem}-修改版.md`);
}

export function downloadBackup(documents) {
  const bytes = createBackupArchive(documents);
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(new Blob([bytes], { type: "application/zip" }), `Moyo-备份-${date}.zip`);
}

export function createBackupArchive(documents, exportedAt = new Date().toISOString()) {
  const entries = {};
  const used = new Set();
  for (const document of documents) {
    let path = normalizePath(document.path || document.name).replace(/^\/+/, "");
    if (!path || used.has(path)) {
      const stem = document.name.replace(/\.md$/i, "");
      let suffix = 2;
      path = document.name;
      while (used.has(path)) path = `${stem}-${suffix++}.md`;
    }
    used.add(path);
    entries[path] = strToU8(document.draft ?? document.original ?? "");
  }
  entries[".moyo/backup.json"] = strToU8(JSON.stringify({
    format: "moyo-backup",
    version: 1,
    exportedAt,
    documents: documents.map((document) => ({
      name: document.name,
      path: document.path,
      original: document.original ?? "",
      draft: document.draft ?? document.original ?? "",
      source: document.source,
      createdAt: document.createdAt,
      modifiedAt: document.modifiedAt,
      history: Array.isArray(document.history) ? document.history : [],
    })),
  }));
  return zipSync(entries, { level: 6 });
}

async function walkDirectoryHandle(rootHandle) {
  const result = [];
  async function walk(directory, prefix) {
    for await (const [name, handle] of directory.entries()) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "directory") {
        await walk(handle, path);
      } else if (handle.kind === "file" && isMarkdown(name)) {
        const file = await handle.getFile();
        result.push({ name, path: `${rootHandle.name}/${path}`, content: await file.text() });
      }
    }
  }
  await walk(rootHandle, "");
  return result.sort((a, b) => a.path.localeCompare(b.path, "zh-CN", { numeric: true }));
}

function chooseInputFiles(input) {
  return new Promise((resolve) => {
    input.value = "";
    const onChange = () => {
      input.removeEventListener("change", onChange);
      resolve([...input.files]);
    };
    input.addEventListener("change", onChange, { once: true });
    input.click();
  });
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/");
}

function normalizeFolderName(name) {
  return normalizePath(String(name || ""))
    .split("/")
    .filter(Boolean)
    .join("-")
    .trim();
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
