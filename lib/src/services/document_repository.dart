import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/local_document.dart';
import 'folder_picker.dart';

class DocumentContent {
  const DocumentContent({required this.original, required this.draft});

  final String original;
  final String draft;
}

class DocumentRepository {
  static const _libraryKey = 'padmd.library.v1';
  static const _legacyContentPrefix = 'padmd.content.v1.';
  static const _originalPrefix = 'padmd.original.v2.';
  static const _draftPrefix = 'padmd.draft.v2.';

  Future<List<LocalDocument>> listDocuments() async {
    final preferences = await SharedPreferences.getInstance();
    final encoded = preferences.getStringList(_libraryKey) ?? const [];
    final documents = <LocalDocument>[];

    for (final item in encoded) {
      try {
        final json = jsonDecode(item) as Map<String, Object?>;
        var document = LocalDocument.fromJson(json);
        if (preferences.containsKey(_legacyKey(document.id))) {
          await _migrateLegacy(preferences, document.id);
        }
        if (preferences.containsKey(_originalKey(document.id))) {
          document = document.copyWith(
            hasDraft: preferences.containsKey(_draftKey(document.id)),
          );
          documents.add(document);
        }
      } on Object {
        // A damaged entry should not prevent valid documents from opening.
      }
    }

    documents.sort((a, b) => b.modifiedAt.compareTo(a.modifiedAt));
    return documents;
  }

  Future<List<LocalDocument>> importDocuments() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['md', 'markdown'],
      allowMultiple: true,
      withData: true,
    );
    if (result == null) return const [];

    final imported = <LocalDocument>[];
    for (final picked in result.files) {
      final bytes = picked.bytes;
      if (bytes == null) continue;
      imported.add(
        await _createFromContent(
          picked.name,
          utf8.decode(bytes, allowMalformed: true),
        ),
      );
    }
    return imported;
  }

  Future<List<LocalDocument>> importFolder() async {
    final files = await pickMarkdownFolder();
    final imported = <LocalDocument>[];
    for (final file in files) {
      imported.add(await _createFromContent(file.name, file.content));
    }
    return imported;
  }

  Future<LocalDocument> createMarkdown() {
    return _createFromContent(
      '未命名文档.md',
      '# 未命名文档\n\n开始写作…\n',
    );
  }

  Future<LocalDocument> _createFromContent(String name, String content) async {
    final now = DateTime.now();
    final id = now.microsecondsSinceEpoch.toString();
    final document = LocalDocument(
      id: id,
      name: name,
      path: _originalKey(id),
      modifiedAt: now,
    );
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_originalKey(id), content);
    await _upsert(document);
    return document;
  }

  Future<DocumentContent> read(LocalDocument document) async {
    final preferences = await SharedPreferences.getInstance();
    await _migrateLegacy(preferences, document.id);
    final original = preferences.getString(_originalKey(document.id));
    if (original == null) throw StateError('文档内容不存在');
    return DocumentContent(
      original: original,
      draft: preferences.getString(_draftKey(document.id)) ?? original,
    );
  }

  Future<LocalDocument> saveDraft(
    LocalDocument document,
    String content,
  ) async {
    final preferences = await SharedPreferences.getInstance();
    final original = preferences.getString(_originalKey(document.id)) ?? '';
    if (content == original) {
      await preferences.remove(_draftKey(document.id));
    } else {
      await preferences.setString(_draftKey(document.id), content);
    }
    final updated = document.copyWith(
      modifiedAt: DateTime.now(),
      hasDraft: content != original,
    );
    await _upsert(updated);
    return updated;
  }

  Future<void> discardDraft(LocalDocument document) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_draftKey(document.id));
    await _upsert(document.copyWith(hasDraft: false));
  }

  Future<void> exportCopy(LocalDocument document, String content) async {
    final lower = document.name.toLowerCase();
    final extension = lower.endsWith('.markdown') ? '.markdown' : '.md';
    final stem = lower.endsWith(extension)
        ? document.name.substring(0, document.name.length - extension.length)
        : document.name;
    await FilePicker.platform.saveFile(
      dialogTitle: '保存 Markdown 副本',
      fileName: '$stem-修改版.md',
      type: FileType.custom,
      allowedExtensions: const ['md'],
      bytes: Uint8List.fromList(utf8.encode(content)),
    );
  }

  Future<void> rename(LocalDocument document, String name) async {
    var safe = name.trim();
    if (safe.isEmpty) return;
    if (!safe.toLowerCase().endsWith('.md') &&
        !safe.toLowerCase().endsWith('.markdown')) {
      safe = '$safe.md';
    }
    await _upsert(document.copyWith(name: safe, modifiedAt: DateTime.now()));
  }

  Future<LocalDocument> duplicate(LocalDocument document) async {
    final content = await read(document);
    final lower = document.name.toLowerCase();
    final suffix = lower.endsWith('.markdown') ? '.markdown' : '.md';
    final stem =
        document.name.substring(0, document.name.length - suffix.length);
    return _createFromContent('$stem-副本$suffix', content.draft);
  }

  Future<void> delete(LocalDocument document) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_originalKey(document.id));
    await preferences.remove(_draftKey(document.id));
    await preferences.remove(_legacyKey(document.id));
    final documents = await listDocuments();
    documents.removeWhere((item) => item.id == document.id);
    await preferences.setStringList(
      _libraryKey,
      documents.map((item) => jsonEncode(item.toJson())).toList(),
    );
  }

  Future<void> _migrateLegacy(SharedPreferences preferences, String id) async {
    if (preferences.containsKey(_originalKey(id))) return;
    final legacy = preferences.getString(_legacyKey(id));
    if (legacy == null) return;
    await preferences.setString(_originalKey(id), legacy);
  }

  Future<void> _upsert(LocalDocument document) async {
    final documents = await listDocuments();
    documents.removeWhere((item) => item.id == document.id);
    documents.insert(0, document);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setStringList(
      _libraryKey,
      documents.map((item) => jsonEncode(item.toJson())).toList(),
    );
  }

  static String _legacyKey(String id) => '$_legacyContentPrefix$id';
  static String _originalKey(String id) => '$_originalPrefix$id';
  static String _draftKey(String id) => '$_draftPrefix$id';
}
