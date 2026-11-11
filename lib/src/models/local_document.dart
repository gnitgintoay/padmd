class LocalDocument {
  const LocalDocument({
    required this.id,
    required this.name,
    required this.path,
    required this.modifiedAt,
    this.hasDraft = false,
  });

  final String id;
  final String name;
  final String path;
  final DateTime modifiedAt;
  final bool hasDraft;

  LocalDocument copyWith({
    String? name,
    DateTime? modifiedAt,
    bool? hasDraft,
  }) {
    return LocalDocument(
      id: id,
      name: name ?? this.name,
      path: path,
      modifiedAt: modifiedAt ?? this.modifiedAt,
      hasDraft: hasDraft ?? this.hasDraft,
    );
  }

  Map<String, Object> toJson() => {
        'id': id,
        'name': name,
        'path': path,
        'modifiedAt': modifiedAt.toIso8601String(),
        'hasDraft': hasDraft,
      };

  factory LocalDocument.fromJson(Map<String, Object?> json) {
    return LocalDocument(
      id: json['id']! as String,
      name: json['name']! as String,
      path: json['path']! as String,
      modifiedAt: DateTime.parse(json['modifiedAt']! as String),
      hasDraft: json['hasDraft'] as bool? ?? false,
    );
  }
}
