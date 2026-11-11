const DB_NAME = "padmd-web";
const DB_VERSION = 1;
const DOCUMENTS = "documents";
const SETTINGS = "settings";

let databasePromise;

function openDatabase() {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCUMENTS)) {
        const documents = db.createObjectStore(DOCUMENTS, { keyPath: "id" });
        documents.createIndex("modifiedAt", "modifiedAt");
        documents.createIndex("path", "path");
      }
      if (!db.objectStoreNames.contains(SETTINGS)) {
        db.createObjectStore(SETTINGS);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(name, mode = "readonly") {
  const db = await openDatabase();
  return db.transaction(name, mode).objectStore(name);
}

export async function listDocuments({ includeTrashed = false } = {}) {
  const documents = await requestResult((await store(DOCUMENTS)).getAll());
  return documents
    .filter((document) => includeTrashed || !document.trashed)
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export async function getDocument(id) {
  return requestResult((await store(DOCUMENTS)).get(id));
}

export async function putDocument(document) {
  await requestResult((await store(DOCUMENTS, "readwrite")).put(document));
  return document;
}

export async function permanentlyDeleteDocument(id) {
  await requestResult((await store(DOCUMENTS, "readwrite")).delete(id));
}

export async function getSetting(key, fallback = null) {
  const value = await requestResult((await store(SETTINGS)).get(key));
  return value === undefined ? fallback : value;
}

export async function setSetting(key, value) {
  await requestResult((await store(SETTINGS, "readwrite")).put(value, key));
}

export function createDocument({ name, path = name, content = "", source = "local" }) {
  const now = Date.now();
  return {
    id: crypto.randomUUID?.() || `${now}-${Math.random().toString(16).slice(2)}`,
    name: ensureMarkdownExtension(name || "未命名文档.md"),
    path: path || name,
    original: content,
    draft: content,
    source,
    createdAt: now,
    modifiedAt: now,
    exportedAt: null,
    trashed: false,
  };
}

export function ensureMarkdownExtension(name) {
  const value = name.trim() || "未命名文档.md";
  return /\.(?:md|markdown|mdown|mkd)$/i.test(value) ? value : `${value}.md`;
}

function decodeSharedPreference(raw) {
  if (raw == null) return null;
  let value = raw;
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      value = JSON.parse(value);
    } catch {
      break;
    }
    if (typeof value !== "string") break;
  }
  return value;
}

function findLegacyValue(suffix) {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.endsWith(suffix)) return decodeSharedPreference(localStorage.getItem(key));
  }
  return null;
}

export async function migrateFlutterDocuments() {
  if (await getSetting("flutterMigrationComplete", false)) return 0;

  const library = findLegacyValue("padmd.library.v1");
  if (!Array.isArray(library) || library.length === 0) {
    await setSetting("flutterMigrationComplete", true);
    return 0;
  }

  let migrated = 0;
  for (const encoded of library) {
    try {
      const metadata = typeof encoded === "string" ? JSON.parse(encoded) : encoded;
      const original =
        findLegacyValue(`padmd.original.v2.${metadata.id}`) ??
        findLegacyValue(`padmd.content.v1.${metadata.id}`);
      if (typeof original !== "string") continue;
      const draft = findLegacyValue(`padmd.draft.v2.${metadata.id}`);
      const document = createDocument({
        name: metadata.name,
        path: metadata.name,
        content: original,
        source: "flutter-migration",
      });
      document.id = `flutter-${metadata.id}`;
      document.draft = typeof draft === "string" ? draft : original;
      document.modifiedAt = Date.parse(metadata.modifiedAt) || Date.now();
      await putDocument(document);
      migrated += 1;
    } catch (error) {
      console.warn("Skipping damaged Flutter document", error);
    }
  }
  await setSetting("flutterMigrationComplete", true);
  return migrated;
}
