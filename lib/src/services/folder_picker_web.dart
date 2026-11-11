// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use

import 'dart:html' as html;

class FolderMarkdownFile {
  const FolderMarkdownFile(this.name, this.content);

  final String name;
  final String content;
}

bool get supportsFolderImport => true;

Future<List<FolderMarkdownFile>> pickMarkdownFolder() async {
  final input = html.FileUploadInputElement()
    ..multiple = true
    ..accept = '.md,.markdown'
    ..setAttribute('webkitdirectory', '')
    ..setAttribute('directory', '');
  input.click();
  await input.onChange.first;

  final markdownFiles = (input.files ?? const <html.File>[]).where((file) {
    final lower = file.name.toLowerCase();
    return lower.endsWith('.md') || lower.endsWith('.markdown');
  });
  final result = <FolderMarkdownFile>[];
  for (final file in markdownFiles) {
    final reader = html.FileReader()..readAsText(file, 'utf-8');
    await reader.onLoad.first;
    result.add(FolderMarkdownFile(file.name, reader.result as String? ?? ''));
  }
  return result;
}
