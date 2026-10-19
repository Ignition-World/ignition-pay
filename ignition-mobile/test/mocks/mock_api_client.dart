import 'package:dio/dio.dart';
import 'package:mocktail/mocktail.dart';
import 'package:ignition_mobile/core/network/api_client.dart';

class MockApiClient extends Mock implements ApiClient {}

/// Creates a successful [Response] with the given [data].
Response<T> mockResponse<T>(
  T data, {
  int statusCode = 200,
  String path = '/test',
}) {
  return Response<T>(
    data: data,
    statusCode: statusCode,
    requestOptions: RequestOptions(path: path),
  );
}

/// Creates a [DioException] for simulating API errors in tests.
DioException mockDioException({
  int statusCode = 500,
  String? message,
  String path = '/test',
}) {
  final response = Response<dynamic>(
    statusCode: statusCode,
    data: {'error': message ?? 'Internal Server Error'},
    requestOptions: RequestOptions(path: path),
  );
  return DioException(
    requestOptions: RequestOptions(path: path),
    response: response,
    type: DioExceptionType.badResponse,
    message: message ?? 'Internal Server Error',
  );
}

/// Registers fallback values needed by mocktail for [ApiClient] method stubs.
void registerApiClientFallbacks() {
  registerFallbackValue(<String, dynamic>{});
}
