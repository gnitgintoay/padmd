class FolderMarkdownFile {
  const FolderMarkdownFile(this.name, this.content);

  final String name;
  final String content;
}

bool get supportsFolderImport => false;

Future<List<FolderMarkdownFile>> pickMarkdownFolder() async => const [];
