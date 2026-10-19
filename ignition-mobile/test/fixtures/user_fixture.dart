import 'package:ignition_mobile/features/auth/models/user.dart';

/// Builds [User] instances for use in tests.
///
/// Call [UserFixture.create] for a fully customisable user, or use the named
/// factory helpers ([verified], [withAvatar]) for common scenarios.
class UserFixture {
  UserFixture._();

  static const String _defaultId = 'user_test_001';
  static const String _defaultEmail = 'test@example.com';
  static const String _defaultDisplayName = 'Test User';

  /// Returns a [User] with sensible defaults; override any field as needed.
  static User create({
    String id = _defaultId,
    String email = _defaultEmail,
    String displayName = _defaultDisplayName,
    String? avatarUrl,
    DateTime? createdAt,
    DateTime? updatedAt,
    bool isVerified = false,
  }) {
    final now = DateTime(2024, 1, 1);
    return User(
      id: id,
      email: email,
      displayName: displayName,
      avatarUrl: avatarUrl,
      createdAt: createdAt ?? now,
      updatedAt: updatedAt ?? now,
      isVerified: isVerified,
    );
  }

  /// A verified user — [isVerified] is `true`.
  static User verified({
    String id = _defaultId,
    String email = _defaultEmail,
    String displayName = _defaultDisplayName,
  }) =>
      create(id: id, email: email, displayName: displayName, isVerified: true);

  /// A user who has set a profile avatar.
  static User withAvatar({
    String avatarUrl = 'https://example.com/avatars/test.jpg',
  }) =>
      create(avatarUrl: avatarUrl);

  /// Returns the JSON representation that the API would send for a [User].
  static Map<String, dynamic> toJson({
    String id = _defaultId,
    String email = _defaultEmail,
    String displayName = _defaultDisplayName,
    String? avatarUrl,
    String? createdAt,
    String? updatedAt,
    bool isVerified = false,
  }) {
    return {
      'id': id,
      'email': email,
      'display_name': displayName,
      if (avatarUrl != null) 'avatarUrl': avatarUrl,
      'created_at': createdAt ?? '2024-01-01T00:00:00.000Z',
      'updated_at': updatedAt ?? '2024-01-01T00:00:00.000Z',
      'isVerified': isVerified,
    };
  }

  /// A list of [count] distinct users for pagination / list-view tests.
  static List<User> list(int count) {
    return List.generate(
      count,
      (i) => create(
        id: 'user_test_${i.toString().padLeft(3, '0')}',
        email: 'user$i@example.com',
        displayName: 'Test User $i',
      ),
    );
  }
}
