/*
 * Folder-picker fallback and recursive traversal are adapted from the design of
 * techjewel/mdread (MIT). PadMD stores imported text as a safe browser-local
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
    root: files[0]?.path.split("/")[0] || "",
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
  if (!file) return [];
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
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

export function downloadMarkdown(document, content) {
  const stem = document.name.replace(/\.(?:md|markdown|mdown|mkd)$/i, "");
  downloadBlob(new Blob([content], { type: "text/markdown;charset=utf-8" }), `${stem}-修改版.md`);
}

export function downloadBackup(documents) {
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
  const bytes = zipSync(entries, { level: 6 });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(new Blob([bytes], { type: "application/zip" }), `PadMD-备份-${date}.zip`);
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
