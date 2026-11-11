import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

import '../models/local_document.dart';
import '../services/document_repository.dart';

enum _CompactPane { edit, preview }

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

class _ReaderScreenState extends State<ReaderScreen> {
  final TextEditingController _controller = TextEditingController();
  Timer? _saveTimer;
  bool _loading = true;
  bool _saving = false;
  bool _exporting = false;
  String? _error;
  _CompactPane _compactPane = _CompactPane.edit;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      _controller.text = await widget.repository.read(widget.document);
      _controller.addListener(_changed);
    } on Object catch (error) {
      _error = error.toString();
    }
    if (mounted) setState(() => _loading = false);
  }

  void _changed() {
    setState(() {});
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 700), _save);
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await widget.repository.save(widget.document, _controller.text);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _export() async {
    if (_exporting) return;
    setState(() => _exporting = true);
    try {
      await widget.repository.exportDocument(
        widget.document,
        _controller.text,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已导出 Markdown 文件')),
        );
      }
    } on Object catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('导出失败：$error')),
        );
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  void dispose() {
    _saveTimer?.cancel();
    _controller.removeListener(_changed);
    unawaited(widget.repository.save(widget.document, _controller.text));
    _controller.dispose();
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

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.document.name),
        actions: [
          IconButton(
            tooltip: '导出 Markdown',
            onPressed: _exporting ? null : _export,
            icon: _exporting
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.download_outlined),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Text(
                _saving ? '正在保存…' : '已自动保存',
                style: Theme.of(context).textTheme.labelMedium,
              ),
            ),
          ),
        ],
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final split = constraints.maxWidth >= 800;
          if (split) {
            return Row(
              children: [
                Expanded(child: _editor()),
                const VerticalDivider(width: 1),
                Expanded(child: _markdownPreview()),
              ],
            );
          }
          return Column(
            children: [
              SegmentedButton<_CompactPane>(
                segments: const [
                  ButtonSegment(
                    value: _CompactPane.edit,
                    icon: Icon(Icons.edit_outlined),
                    label: Text('编辑'),
                  ),
                  ButtonSegment(
                    value: _CompactPane.preview,
                    icon: Icon(Icons.visibility_outlined),
                    label: Text('预览'),
                  ),
                ],
                selected: {_compactPane},
                onSelectionChanged: (value) {
                  setState(() => _compactPane = value.first);
                },
              ),
              const SizedBox(height: 8),
              Expanded(
                child: _compactPane == _CompactPane.edit
                    ? _editor()
                    : _markdownPreview(),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _editor() {
    return TextField(
      controller: _controller,
      expands: true,
      maxLines: null,
      minLines: null,
      keyboardType: TextInputType.multiline,
      textAlignVertical: TextAlignVertical.top,
      style: const TextStyle(
        fontFamily: 'monospace',
        fontSize: 16,
        height: 1.6,
      ),
      decoration: const InputDecoration(
        border: InputBorder.none,
        contentPadding: EdgeInsets.all(24),
        hintText: '开始写作…',
      ),
    );
  }

  Widget _markdownPreview() {
    return Markdown(
      data: _controller.text,
      selectable: true,
      padding: const EdgeInsets.fromLTRB(32, 24, 32, 80),
    );
  }
}
