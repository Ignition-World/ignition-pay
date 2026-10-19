/// Raw JSON maps mirroring the [BaseResponse] envelope returned by the API.
///
/// These are useful when testing JSON deserialization; for already-typed
/// [BaseResponse] objects, construct them directly with the freezed factory.
class BaseResponseFixture {
  BaseResponseFixture._();

  /// A successful response envelope wrapping an arbitrary [data] payload.
  static Map<String, dynamic> success({
    dynamic data,
    String? message,
  }) {
    return {
      'success': true,
      if (message != null) 'message': message,
      if (data != null) 'data': data,
    };
  }

  /// An error response envelope with an optional [errorCode].
  static Map<String, dynamic> error({
    String message = 'An unexpected error occurred.',
    String? errorCode,
  }) {
    return {
      'success': false,
      'message': message,
      if (errorCode != null) 'error_code': errorCode,
    };
  }

  /// A paginated list response wrapping [items] as the data payload.
  static Map<String, dynamic> paginated({
    required List<dynamic> items,
    int page = 1,
    int limit = 20,
    int? total,
  }) {
    return success(
      data: {
        'items': items,
        'page': page,
        'limit': limit,
        'total': total ?? items.length,
        'hasMore': (total ?? items.length) > (page * limit),
      },
    );
  }

  /// A validation-error response — mimics 422 Unprocessable Entity bodies.
  static Map<String, dynamic> validationError({
    Map<String, String> fieldErrors = const {},
    String message = 'Validation failed.',
  }) {
    return {
      'success': false,
      'message': message,
      'error_code': 'VALIDATION_ERROR',
      'errors': fieldErrors,
    };
  }
}
