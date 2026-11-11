import 'package:flutter_test/flutter_test.dart';
import 'package:padmd/src/models/local_document.dart';

void main() {
  test('local document JSON round-trip preserves fields', () {
    final original = LocalDocument(
      id: '42',
      name: 'notes.md',
      path: '/documents/notes.md',
      modifiedAt: DateTime.utc(2026, 11, 10),
    );

    final restored = LocalDocument.fromJson(original.toJson());

    expect(restored.id, original.id);
    expect(restored.name, original.name);
    expect(restored.modifiedAt, original.modifiedAt);
  });
}
