import 'package:flutter/material.dart';

import '../models/local_document.dart';
import '../services/document_repository.dart';
import '../services/folder_picker.dart';
import 'reader_screen.dart';

enum _DocumentAction { rename, duplicate, delete }

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({
    required this.repository,
    required this.themeMode,
    required this.onThemeChanged,
    super.key,
  });

  final DocumentRepository repository;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeChanged;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final _searchController = TextEditingController();
  late Future<List<LocalDocument>> _documents;

  @override
  void initState() {
    super.initState();
    _refresh();
    _searchController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _refresh() => _documents = widget.repository.listDocuments();

  Future<void> _open(LocalDocument document) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => ReaderScreen(
          document: document,
          repository: widget.repository,
        ),
      ),
    );
    if (mounted) setState(_refresh);
  }

  Future<void> _importFiles() async {
    try {
      final documents = await widget.repository.importDocuments();
      if (!mounted || documents.isEmpty) return;
      setState(_refresh);
      if (documents.length == 1) await _open(documents.single);
      if (documents.length > 1 && mounted) {
        _message('已导入 ${documents.length} 个 Markdown 文件');
      }
    } on Object catch (error) {
      if (mounted) _message('导入失败：$error');
    }
  }

  Future<void> _importFolder() async {
    try {
      final documents = await widget.repository.importFolder();
      if (!mounted || documents.isEmpty) return;
      setState(_refresh);
      _message('已从文件夹复制 ${documents.length} 个 Markdown 文件');
    } on Object catch (error) {
      if (mounted) _message('文件夹导入失败：$error');
    }
  }

  Future<void> _create() async {
    final document = await widget.repository.createMarkdown();
    if (mounted) await _open(document);
  }

  Future<void> _handleAction(
    LocalDocument document,
    _DocumentAction action,
  ) async {
    switch (action) {
      case _DocumentAction.rename:
        final controller = TextEditingController(text: document.name);
        final name = await showDialog<String>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('重命名文档'),
            content: TextField(
              controller: controller,
              autofocus: true,
              decoration: const InputDecoration(labelText: '文件名'),
              onSubmitted: (value) => Navigator.pop(context, value),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('取消'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, controller.text),
                child: const Text('确定'),
              ),
            ],
          ),
        );
        controller.dispose();
        if (name != null) await widget.repository.rename(document, name);
      case _DocumentAction.duplicate:
        await widget.repository.duplicate(document);
        if (mounted) _message('已创建副本');
      case _DocumentAction.delete:
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('删除本地文档？'),
            content: const Text('只删除 Moyo 中的副本，不会删除“文件”App里的原文件。'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('取消'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('删除'),
              ),
            ],
          ),
        );
        if (confirmed == true) await widget.repository.delete(document);
    }
    if (mounted) setState(_refresh);
  }

  void _message(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Moyo'),
        actions: [
          IconButton(
            tooltip: '切换明暗主题',
            onPressed: () => widget.onThemeChanged(
              Theme.of(context).brightness == Brightness.dark
                  ? ThemeMode.light
                  : ThemeMode.dark,
            ),
            icon: const Icon(Icons.brightness_6_outlined),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: FutureBuilder<List<LocalDocument>>(
        future: _documents,
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final query = _searchController.text.trim().toLowerCase();
          final all = snapshot.data!;
          final documents = query.isEmpty
              ? all
              : all
                  .where((item) => item.name.toLowerCase().contains(query))
                  .toList();
          return Column(
            children: [
              const _InstallHint(),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 4),
                child: SearchBar(
                  controller: _searchController,
                  hintText: '搜索文档名称',
                  leading: const Icon(Icons.search),
                  trailing: query.isEmpty
                      ? null
                      : [
                          IconButton(
                            tooltip: '清除',
                            onPressed: _searchController.clear,
                            icon: const Icon(Icons.close),
                          ),
                        ],
                ),
              ),
              Expanded(
                child: all.isEmpty
                    ? _EmptyLibrary(onImport: _importFiles)
                    : documents.isEmpty
                        ? const Center(child: Text('没有匹配的文档'))
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(24, 8, 24, 120),
                            itemCount: documents.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 8),
                            itemBuilder: (context, index) {
                              final document = documents[index];
                              return Card(
                                clipBehavior: Clip.antiAlias,
                                child: ListTile(
                                  contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 20,
                                    vertical: 10,
                                  ),
                                  leading: Icon(
                                    document.hasDraft
                                        ? Icons.edit_note
                                        : Icons.article_outlined,
                                  ),
                                  title: Text(document.name),
                                  subtitle: Text(
                                    document.hasDraft
                                        ? '有未导出的恢复草稿 · 不影响原文件'
                                        : '原始副本 · ${_date(document.modifiedAt)}',
                                  ),
                                  trailing: PopupMenuButton<_DocumentAction>(
                                    tooltip: '文档操作',
                                    onSelected: (action) =>
                                        _handleAction(document, action),
                                    itemBuilder: (_) => const [
                                      PopupMenuItem(
                                        value: _DocumentAction.rename,
                                        child: Text('重命名'),
                                      ),
                                      PopupMenuItem(
                                        value: _DocumentAction.duplicate,
                                        child: Text('创建副本'),
                                      ),
                                      PopupMenuItem(
                                        value: _DocumentAction.delete,
                                        child: Text('删除本地副本'),
                                      ),
                                    ],
                                  ),
                                  onTap: () => _open(document),
                                ),
                              );
                            },
                          ),
              ),
            ],
          );
        },
      ),
      floatingActionButton: Wrap(
        spacing: 10,
        children: [
          if (supportsFolderImport)
            FloatingActionButton.extended(
              heroTag: 'folder',
              onPressed: _importFolder,
              icon: const Icon(Icons.folder_open_outlined),
              label: const Text('导入文件夹'),
            ),
          FloatingActionButton.extended(
            heroTag: 'import',
            onPressed: _importFiles,
            icon: const Icon(Icons.file_open_outlined),
            label: const Text('导入文件'),
          ),
          FloatingActionButton(
            heroTag: 'create',
            tooltip: '新建文档',
            onPressed: _create,
            child: const Icon(Icons.add),
          ),
        ],
      ),
    );
  }

  String _date(DateTime value) {
    String two(int number) => number.toString().padLeft(2, '0');
    return '${value.year}-${two(value.month)}-${two(value.day)} '
        '${two(value.hour)}:${two(value.minute)}';
  }
}

class _EmptyLibrary extends StatelessWidget {
  const _EmptyLibrary({required this.onImport});

  final VoidCallback onImport;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.menu_book_outlined,
              size: 72,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 20),
            Text('你的 Markdown 文档',
                style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 12),
            const Text(
              '导入后会创建安全副本；编辑草稿不会覆盖“文件”App里的原文件。',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onImport,
              icon: const Icon(Icons.file_open_outlined),
              label: const Text('导入 Markdown'),
            ),
          ],
        ),
      ),
    );
  }
}

class _InstallHint extends StatelessWidget {
  const _InstallHint();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(24, 12, 24, 4),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Text(
        'iPad 安装：Safari 分享 → 添加到主屏幕。重要文档请定期“保存副本”。',
      ),
    );
  }
}
