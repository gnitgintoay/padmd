import 'package:flutter/material.dart';

import '../models/local_document.dart';
import '../services/document_repository.dart';
import 'reader_screen.dart';

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
  late Future<List<LocalDocument>> _documents;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  void _refresh() {
    _documents = widget.repository.listDocuments();
  }

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

  Future<void> _import() async {
    try {
      final document = await widget.repository.importDocument();
      if (document != null && mounted) await _open(document);
    } on Object catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('导入失败：$error')),
        );
      }
    }
  }

  Future<void> _create() async {
    final document = await widget.repository.createMarkdown();
    if (mounted) await _open(document);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('PadMD'),
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
          final documents = snapshot.data!;
          if (documents.isEmpty) return _EmptyLibrary(onImport: _import);
          return Column(
            children: [
              const _InstallHint(),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(24, 8, 24, 120),
                  itemCount: documents.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final document = documents[index];
                    return Card(
                      clipBehavior: Clip.antiAlias,
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 20,
                          vertical: 10,
                        ),
                        leading: const Icon(Icons.article_outlined),
                        title: Text(document.name),
                        subtitle: const Text('Markdown · 浏览器本地保存'),
                        trailing: const Icon(Icons.chevron_right),
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
        spacing: 12,
        children: [
          FloatingActionButton.extended(
            heroTag: 'import',
            onPressed: _import,
            icon: const Icon(Icons.file_open_outlined),
            label: const Text('打开文件'),
          ),
          FloatingActionButton.extended(
            heroTag: 'create',
            onPressed: _create,
            icon: const Icon(Icons.add),
            label: const Text('新建'),
          ),
        ],
      ),
    );
  }
}

class _EmptyLibrary extends StatelessWidget {
  const _EmptyLibrary({required this.onImport});

  final VoidCallback onImport;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
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
              const SizedBox(height: 24),
              Text(
                '你的本地文档书架',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              const Text(
                '打开 Markdown 文件进行阅读和编辑。内容保存在当前浏览器中，可随时导出备份。',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: onImport,
                icon: const Icon(Icons.file_open_outlined),
                label: const Text('选择文档'),
              ),
            ],
          ),
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
      child: const Text('iPad 安装：Safari 分享按钮 → 添加到主屏幕'),
    );
  }
}
