import 'package:flutter/material.dart';

import 'screens/library_screen.dart';
import 'services/document_repository.dart';

class PadMdApp extends StatefulWidget {
  const PadMdApp({super.key});

  @override
  State<PadMdApp> createState() => _PadMdAppState();
}

class _PadMdAppState extends State<PadMdApp> {
  final DocumentRepository _repository = DocumentRepository();
  ThemeMode _themeMode = ThemeMode.system;

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF3D5A80);
    return MaterialApp(
      title: 'PadMD',
      debugShowCheckedModeBanner: false,
      themeMode: _themeMode,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF7F7F4),
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: seed,
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: LibraryScreen(
        repository: _repository,
        themeMode: _themeMode,
        onThemeChanged: (mode) => setState(() => _themeMode = mode),
      ),
    );
  }
}
