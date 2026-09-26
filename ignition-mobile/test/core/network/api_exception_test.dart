import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/core/network/api_exception.dart';

void main() {
  group('apiExceptionFromDio', () {
    RequestOptions _opts() => RequestOptions(path: '/test');

    DioException _dio({
      required DioExceptionType type,
      int? statusCode,
      String? message,
    }) {
      return DioException(
        requestOptions: _opts(),
        type: type,
        message: message,
        response: statusCode != null
            ? Response(
                requestOptions: _opts(),
                statusCode: statusCode,
              )
            : null,
      );
    }

    test('connectionError → NoConnectionException', () {
      final result = apiExceptionFromDio(_dio(type: DioExceptionType.connectionError));
      expect(result, isA<NoConnectionException>());
      expect(result.userMessage, contains('No connection'));
    });

    test('connectionTimeout → SlowConnectionException', () {
      final result = apiExceptionFromDio(_dio(type: DioExceptionType.connectionTimeout));
      expect(result, isA<SlowConnectionException>());
      expect(result.userMessage, contains('Slow connection'));
    });

    test('receiveTimeout → SlowConnectionException', () {
      final result = apiExceptionFromDio(_dio(type: DioExceptionType.receiveTimeout));
      expect(result, isA<SlowConnectionException>());
    });

    test('sendTimeout → SlowConnectionException', () {
      final result = apiExceptionFromDio(_dio(type: DioExceptionType.sendTimeout));
      expect(result, isA<SlowConnectionException>());
    });

    test('401 badResponse → UnauthorizedException', () {
      final result = apiExceptionFromDio(
        _dio(type: DioExceptionType.badResponse, statusCode: 401),
      );
      expect(result, isA<UnauthorizedException>());
      expect(result.userMessage, contains('session has expired'));
    });

    test('500 badResponse → ServerException', () {
      final result = apiExceptionFromDio(
        _dio(type: DioExceptionType.badResponse, statusCode: 500),
      );
      expect(result, isA<ServerException>());
      expect(result.userMessage, contains('Server error'));
    });

    test('503 badResponse → ServerException', () {
      final result = apiExceptionFromDio(
        _dio(type: DioExceptionType.badResponse, statusCode: 503),
      );
      expect(result, isA<ServerException>());
    });

    test('422 badResponse → UnexpectedApiException', () {
      final result = apiExceptionFromDio(
        _dio(type: DioExceptionType.badResponse, statusCode: 422),
      );
      expect(result, isA<UnexpectedApiException>());
      expect(result.userMessage, contains('Something went wrong'));
    });

    test('unknown with SocketException message → NoConnectionException', () {
      final result = apiExceptionFromDio(
        _dio(type: DioExceptionType.unknown, message: 'SocketException: Failed host lookup'),
      );
      expect(result, isA<NoConnectionException>());
    });

    test('unknown without socket message → UnexpectedApiException', () {
      final result = apiExceptionFromDio(
        _dio(type: DioExceptionType.unknown, message: 'Some other error'),
      );
      expect(result, isA<UnexpectedApiException>());
    });

    test('cancel → UnexpectedApiException', () {
      final result = apiExceptionFromDio(_dio(type: DioExceptionType.cancel));
      expect(result, isA<UnexpectedApiException>());
    });
  });

  group('ApiException.userMessage — no raw details leaked', () {
    test('NoConnectionException does not contain Dio internals', () {
      const e = NoConnectionException();
      expect(e.userMessage, isNot(contains('DioException')));
      expect(e.userMessage, isNot(contains('SocketException')));
    });

    test('ServerException does not contain status code', () {
      const e = ServerException();
      expect(e.userMessage, isNot(contains('500')));
      expect(e.userMessage, isNot(contains('statusCode')));
    });

    test('UnauthorizedException does not leak token details', () {
      const e = UnauthorizedException();
      expect(e.userMessage, isNot(contains('Bearer')));
      expect(e.userMessage, isNot(contains('401')));
    });
  });
}
