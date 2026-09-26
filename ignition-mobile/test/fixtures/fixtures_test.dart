import 'package:flutter_test/flutter_test.dart';

import '../test_utils.dart';

void main() {
  group('UserFixture', () {
    test('create returns a User with default values', () {
      final user = UserFixture.create();

      expect(user.id, 'user_test_001');
      expect(user.email, 'test@example.com');
      expect(user.displayName, 'Test User');
      expect(user.isVerified, isFalse);
      expect(user.avatarUrl, isNull);
    });

    test('verified returns a User with isVerified true', () {
      final user = UserFixture.verified();

      expect(user.isVerified, isTrue);
    });

    test('withAvatar returns a User with a non-null avatarUrl', () {
      final user = UserFixture.withAvatar();

      expect(user.avatarUrl, isNotNull);
      expect(user.avatarUrl, contains('http'));
    });

    test('toJson produces snake_case keys expected by the API', () {
      final json = UserFixture.toJson();

      expect(json.containsKey('display_name'), isTrue);
      expect(json.containsKey('created_at'), isTrue);
      expect(json.containsKey('updated_at'), isTrue);
    });

    test('list generates the requested number of distinct users', () {
      final users = UserFixture.list(5);

      expect(users.length, 5);
      final ids = users.map((u) => u.id).toSet();
      expect(ids.length, 5);
    });
  });

  group('AuthFixture', () {
    test('loginResponse contains access and refresh tokens', () {
      final response = AuthFixture.loginResponse();

      expect(response['success'], isTrue);
      expect(response['data']['access_token'], isNotEmpty);
      expect(response['data']['refresh_token'], isNotEmpty);
    });

    test('loginErrorResponse marks success as false', () {
      final response = AuthFixture.loginErrorResponse();

      expect(response['success'], isFalse);
      expect(response['error_code'], 'INVALID_CREDENTIALS');
    });

    test('refreshResponse contains a new access token', () {
      final response = AuthFixture.refreshResponse();

      expect(response['data']['access_token'], isNotEmpty);
    });
  });

  group('BaseResponseFixture', () {
    test('success wraps data correctly', () {
      final json = BaseResponseFixture.success(data: {'key': 'value'}, message: 'OK');

      expect(json['success'], isTrue);
      expect(json['data'], {'key': 'value'});
      expect(json['message'], 'OK');
    });

    test('error contains error_code when provided', () {
      final json = BaseResponseFixture.error(
        message: 'Not found',
        errorCode: 'NOT_FOUND',
      );

      expect(json['success'], isFalse);
      expect(json['error_code'], 'NOT_FOUND');
    });

    test('paginated sets hasMore correctly', () {
      final json = BaseResponseFixture.paginated(
        items: List.generate(20, (i) => i),
        page: 1,
        limit: 20,
        total: 50,
      );

      expect(json['data']['hasMore'], isTrue);
      expect(json['data']['total'], 50);
    });

    test('validationError includes errors map', () {
      final json = BaseResponseFixture.validationError(
        fieldErrors: {'email': 'Email is required'},
      );

      expect(json['error_code'], 'VALIDATION_ERROR');
      expect((json['errors'] as Map)['email'], 'Email is required');
    });
  });
}
