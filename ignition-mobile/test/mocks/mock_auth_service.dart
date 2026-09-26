import 'package:mocktail/mocktail.dart';
import 'package:ignition_mobile/features/auth/services/auth_service.dart';

class MockAuthService extends Mock implements AuthService {}

/// Registers fallback values needed by mocktail for [AuthService] method stubs.
void registerAuthServiceFallbacks() {
  registerFallbackValue(<String, dynamic>{});
}
