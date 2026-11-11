import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/local_document.dart';

class DocumentRepository {
  static const _libraryKey = 'padmd.library.v1';
  static const _contentPrefix = 'padmd.content.v1.';

  Future<List<LocalDocument>> listDocuments() async {
    final preferences = await SharedPreferences.getInstance();
    final encoded = preferences.getStringList(_libraryKey) ?? const [];
    final documents = <LocalDocument>[];

    for (final item in encoded) {
      try {
        final json = jsonDecode(item) as Map<String, Object?>;
        final document = LocalDocument.fromJson(json);
        if (preferences.containsKey(_contentKey(document.id))) {
          documents.add(document);
        }
      } on Object {
        // Ignore a damaged library entry; valid documents remain available.
      }
    }

    documents.sort((a, b) => b.modifiedAt.compareTo(a.modifiedAt));
    return documents;
  }

  Future<LocalDocument?> importDocument() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['md', 'markdown'],
      withData: true,
    );
    if (result == null) return null;

    final picked = result.files.single;
    final bytes = picked.bytes;
    if (bytes == null) {
      throw StateError('无法读取所选文件');
    }

    final id = DateTime.now().microsecondsSinceEpoch.toString();
    final document = LocalDocument(
      id: id,
      name: picked.name,
      path: _contentKey(id),
      modifiedAt: DateTime.now(),
    );
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _contentKey(id),
      utf8.decode(bytes, allowMalformed: true),
    );
    await _upsert(document);
    return document;
  }

  Future<LocalDocument> createMarkdown() async {
    final now = DateTime.now();
    final id = now.microsecondsSinceEpoch.toString();
    final name = '未命名文档.md';
    final document = LocalDocument(
      id: id,
      name: name,
      path: _contentKey(id),
      modifiedAt: now,
    );
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _contentKey(id),
      '# 未命名文档\n\n开始写作…\n',
    );
    await _upsert(document);
    return document;
  }

  Future<String> read(LocalDocument document) async {
    final preferences = await SharedPreferences.getInstance();
    final content = preferences.getString(_contentKey(document.id));
    if (content == null) throw StateError('文档内容不存在');
    return content;
  }

  Future<LocalDocument> save(LocalDocument document, String content) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_contentKey(document.id), content);
    final updated = LocalDocument(
      id: document.id,
      name: document.name,
      path: document.path,
      modifiedAt: DateTime.now(),
    );
    await _upsert(updated);
    return updated;
  }

  Future<void> exportDocument(LocalDocument document, String content) async {
    await FilePicker.platform.saveFile(
      dialogTitle: '导出 Markdown',
      fileName: document.name,
      type: FileType.custom,
      allowedExtensions: const ['md'],
      bytes: Uint8List.fromList(utf8.encode(content)),
    );
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

  static String _contentKey(String id) => '$_contentPrefix$id';
}
