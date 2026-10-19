import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../test_utils.dart';

void main() {
  late MockApiClient mockApiClient;

  setUpAll(() {
    registerApiClientFallbacks();
  });

  setUp(() {
    mockApiClient = MockApiClient();
  });

  group('MockApiClient', () {
    test('stubs GET to return a mock response', () async {
      when(() => mockApiClient.get<Map<String, dynamic>>(any()))
          .thenAnswer((_) async => mockResponse({'id': '1', 'name': 'Test'}));

      final result = await mockApiClient.get<Map<String, dynamic>>('/test');

      expect(result.statusCode, 200);
      expect(result.data, {'id': '1', 'name': 'Test'});
    });

    test('stubs POST to return a mock response', () async {
      final body = {'email': 'a@b.com', 'password': 'pass'};
      when(() => mockApiClient.post<Map<String, dynamic>>(any(), data: any(named: 'data')))
          .thenAnswer((_) async => mockResponse({'token': 'abc'}));

      final result = await mockApiClient.post<Map<String, dynamic>>('/login', data: body);

      expect(result.data?['token'], 'abc');
    });

    test('stubs GET to throw a DioException for error scenarios', () async {
      when(() => mockApiClient.get<dynamic>(any()))
          .thenThrow(mockDioException(statusCode: 404, message: 'Not Found'));

      expect(
        () => mockApiClient.get<dynamic>('/missing'),
        throwsA(isA<Exception>()),
      );
    });
  });
}
