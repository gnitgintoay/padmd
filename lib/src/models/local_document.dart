class LocalDocument {
  const LocalDocument({
    required this.id,
    required this.name,
    required this.path,
    required this.modifiedAt,
  });

  final String id;
  final String name;
  final String path;
  final DateTime modifiedAt;

  Map<String, Object> toJson() => {
        'id': id,
        'name': name,
        'path': path,
        'modifiedAt': modifiedAt.toIso8601String(),
      };

  factory LocalDocument.fromJson(Map<String, Object?> json) {
    return LocalDocument(
      id: json['id']! as String,
      name: json['name']! as String,
      path: json['path']! as String,
      modifiedAt: DateTime.parse(json['modifiedAt']! as String),
    );
  }
}
