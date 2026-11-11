import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/local_document.dart';
import '../services/document_repository.dart';

enum _EditorMode { single, compare }

class ReaderScreen extends StatefulWidget {
  const ReaderScreen({
    required this.document,
    required this.repository,
    super.key,
  });

  final LocalDocument document;
  final DocumentRepository repository;

  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen>
    with WidgetsBindingObserver {
  final _controller = TextEditingController();
  final _editorFocus = FocusNode();
  final _undoController = UndoHistoryController();
  Timer? _backupTimer;
  String _original = '';
  String _lastBackedUp = '';
  bool _loading = true;
  bool _backingUp = false;
  bool _exporting = false;
  bool _exportedThisSession = false;
  String? _error;
  _EditorMode _mode = _EditorMode.single;

  bool get _changed => _controller.text != _original;
  bool get _needsBackup => _controller.text != _lastBackedUp;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _backupTimer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => _backupDraft(),
    );
  }

  Future<void> _load() async {
    try {
      final content = await widget.repository.read(widget.document);
      _original = content.original;
      _controller.text = content.draft;
      _lastBackedUp = content.draft;
      _controller.addListener(_changedListener);
    } on Object catch (error) {
      _error = error.toString();
    }
    if (mounted) setState(() => _loading = false);
  }

  void _changedListener() {
    _exportedThisSession = false;
    if (mounted) setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      unawaited(_backupDraft());
    }
  }

  Future<void> _backupDraft() async {
    if (_backingUp || !_needsBackup || _loading) return;
    if (mounted) setState(() => _backingUp = true);
    try {
      await widget.repository.saveDraft(widget.document, _controller.text);
      _lastBackedUp = _controller.text;
    } finally {
      if (mounted) setState(() => _backingUp = false);
    }
  }

  Future<void> _exportCopy() async {
    if (_exporting) return;
    setState(() => _exporting = true);
    try {
      await _backupDraft();
      await widget.repository.exportCopy(widget.document, _controller.text);
      if (mounted) {
        setState(() => _exportedThisSession = true);
        _message('已保存为新副本，没有覆盖原文件');
      }
    } on Object catch (error) {
      if (mounted) _message('保存副本失败：$error');
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _discardChanges() async {
    if (!_changed) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('放弃当前修改？'),
        content: const Text('编辑稿将恢复为导入时的原文，此操作不可撤销。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('恢复原文'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    _controller.text = _original;
    _lastBackedUp = _original;
    await widget.repository.discardDraft(widget.document);
    if (mounted) setState(() {});
  }

  void _wrapSelection(String before, String after) {
    final selection = _controller.selection;
    final text = _controller.text;
    final start = selection.isValid ? selection.start : text.length;
    final end = selection.isValid ? selection.end : text.length;
    final selected = text.substring(start, end);
    final replacement = '$before$selected$after';
    _controller.value = TextEditingValue(
      text: text.replaceRange(start, end, replacement),
      selection: TextSelection(
        baseOffset: start + before.length,
        extentOffset: start + before.length + selected.length,
      ),
    );
    _editorFocus.requestFocus();
  }

  void _prefixLines(String prefix) {
    final selection = _controller.selection;
    final text = _controller.text;
    final cursor = selection.isValid ? selection.start : text.length;
    final start = text.lastIndexOf('\n', cursor > 0 ? cursor - 1 : 0) + 1;
    final endSelection = selection.isValid ? selection.end : cursor;
    final nextNewline = text.indexOf('\n', endSelection);
    final end = nextNewline == -1 ? text.length : nextNewline;
    final block = text.substring(start, end);
    final replacement =
        block.split('\n').map((line) => '$prefix$line').join('\n');
    _controller.value = TextEditingValue(
      text: text.replaceRange(start, end, replacement),
      selection: TextSelection(
        baseOffset: start + prefix.length,
        extentOffset: start + replacement.length,
      ),
    );
    _editorFocus.requestFocus();
  }

  Future<void> _findAndReplace() async {
    final find = TextEditingController();
    final replace = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('查找与替换'),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: find,
                autofocus: true,
                decoration: const InputDecoration(labelText: '查找'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: replace,
                decoration: const InputDecoration(labelText: '替换为'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              final query = find.text;
              if (query.isEmpty) return;
              final from =
                  _controller.selection.isValid ? _controller.selection.end : 0;
              var index = _controller.text.indexOf(query, from);
              if (index == -1) index = _controller.text.indexOf(query);
              if (index >= 0) {
                _controller.selection = TextSelection(
                  baseOffset: index,
                  extentOffset: index + query.length,
                );
                Navigator.pop(context);
                _editorFocus.requestFocus();
              }
            },
            child: const Text('查找下一个'),
          ),
          FilledButton(
            onPressed: () {
              if (find.text.isEmpty) return;
              _controller.text =
                  _controller.text.replaceAll(find.text, replace.text);
              Navigator.pop(context);
            },
            child: const Text('全部替换'),
          ),
        ],
      ),
    );
    find.dispose();
    replace.dispose();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _backupTimer?.cancel();
    _controller.removeListener(_changedListener);
    if (_needsBackup) {
      unawaited(widget.repository.saveDraft(widget.document, _controller.text));
    }
    _controller.dispose();
    _editorFocus.dispose();
    _undoController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(child: Text('无法打开文档：$_error')),
      );
    }

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyS, control: true):
            _exportCopy,
        const SingleActivator(LogicalKeyboardKey.keyS, meta: true): _exportCopy,
        const SingleActivator(LogicalKeyboardKey.keyF, control: true):
            _findAndReplace,
        const SingleActivator(LogicalKeyboardKey.keyF, meta: true):
            _findAndReplace,
        const SingleActivator(LogicalKeyboardKey.keyB, control: true): () =>
            _wrapSelection('**', '**'),
        const SingleActivator(LogicalKeyboardKey.keyB, meta: true): () =>
            _wrapSelection('**', '**'),
        const SingleActivator(LogicalKeyboardKey.keyI, control: true): () =>
            _wrapSelection('*', '*'),
        const SingleActivator(LogicalKeyboardKey.keyI, meta: true): () =>
            _wrapSelection('*', '*'),
      },
      child: Focus(
        autofocus: true,
        child: Scaffold(
          appBar: AppBar(
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.document.name),
                Text(_statusText(),
                    style: Theme.of(context).textTheme.labelSmall),
              ],
            ),
            actions: [
              IconButton(
                tooltip: '查找与替换（⌘/Ctrl+F）',
                onPressed: _findAndReplace,
                icon: const Icon(Icons.find_replace),
              ),
              IconButton(
                tooltip: '放弃修改并恢复原文',
                onPressed: _changed ? _discardChanges : null,
                icon: const Icon(Icons.restore),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: FilledButton.icon(
                  onPressed: _exporting ? null : _exportCopy,
                  icon: _exporting
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_alt),
                  label: const Text('保存副本'),
                ),
              ),
            ],
          ),
          body: Column(
            children: [
              _modeBar(),
              const Divider(height: 1),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    if (_mode == _EditorMode.single) return _editor();
                    if (constraints.maxWidth >= 700) {
                      return Row(
                        children: [
                          Expanded(child: _originalView()),
                          const VerticalDivider(width: 1),
                          Expanded(child: _editor()),
                        ],
                      );
                    }
                    return Column(
                      children: [
                        Expanded(child: _originalView()),
                        const Divider(height: 1),
                        Expanded(child: _editor()),
                      ],
                    );
                  },
                ),
              ),
              _formatBar(),
              _documentStats(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _modeBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          SegmentedButton<_EditorMode>(
            segments: const [
              ButtonSegment(
                value: _EditorMode.single,
                icon: Icon(Icons.edit_outlined),
                label: Text('单栏编辑'),
              ),
              ButtonSegment(
                value: _EditorMode.compare,
                icon: Icon(Icons.compare_outlined),
                label: Text('原文对照'),
              ),
            ],
            selected: {_mode},
            onSelectionChanged: (value) => setState(() => _mode = value.first),
          ),
          const Spacer(),
          const Flexible(
            child: Text(
              '恢复草稿不会覆盖原文件',
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _editor() {
    return TextField(
      controller: _controller,
      focusNode: _editorFocus,
      undoController: _undoController,
      expands: true,
      maxLines: null,
      minLines: null,
      keyboardType: TextInputType.multiline,
      textAlignVertical: TextAlignVertical.top,
      style:
          const TextStyle(fontFamily: 'monospace', fontSize: 17, height: 1.65),
      decoration: const InputDecoration(
        border: InputBorder.none,
        contentPadding: EdgeInsets.all(24),
        hintText: '开始写作…',
      ),
    );
  }

  Widget _originalView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: const Text('原始内容（只读）'),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: SelectableText(
              _original,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 16,
                height: 1.65,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _formatBar() {
    return Material(
      color: Theme.of(context).colorScheme.surfaceContainer,
      child: SizedBox(
        height: 50,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          children: [
            _tool('H', '标题', () => _prefixLines('# ')),
            _tool('B', '加粗', () => _wrapSelection('**', '**')),
            _tool('I', '斜体', () => _wrapSelection('*', '*')),
            _tool('—', '无序列表', () => _prefixLines('- ')),
            _tool('1.', '有序列表', () => _prefixLines('1. ')),
            _tool('☐', '待办事项', () => _prefixLines('- [ ] ')),
            _tool('❯', '引用', () => _prefixLines('> ')),
            _tool('</>', '行内代码', () => _wrapSelection('`', '`')),
            _tool('```', '代码块', () => _wrapSelection('```\n', '\n```')),
            _tool('🔗', '链接', () => _wrapSelection('[', '](https://)')),
            IconButton(
              tooltip: '撤销',
              onPressed: _undoController.undo,
              icon: const Icon(Icons.undo),
            ),
            IconButton(
              tooltip: '重做',
              onPressed: _undoController.redo,
              icon: const Icon(Icons.redo),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tool(String label, String tooltip, VoidCallback action) {
    return Tooltip(
      message: tooltip,
      child: TextButton(onPressed: action, child: Text(label)),
    );
  }

  Widget _documentStats() {
    final text = _controller.text;
    final characters = text.characters.length;
    final lines = text.isEmpty ? 0 : '\n'.allMatches(text).length + 1;
    final words =
        text.trim().isEmpty ? 0 : text.trim().split(RegExp(r'\s+')).length;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      color: Theme.of(context).colorScheme.surfaceContainerLow,
      child: Text(
        '$lines 行 · $characters 字符 · $words 词',
        textAlign: TextAlign.right,
        style: Theme.of(context).textTheme.labelSmall,
      ),
    );
  }

  String _statusText() {
    if (_exportedThisSession) return '已保存副本';
    if (!_changed) return '未修改';
    if (_backingUp) return '正在备份恢复草稿…';
    if (_needsBackup) return '有未备份的修改';
    return '恢复草稿已备份（未覆盖原文件）';
  }

  void _message(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
}
