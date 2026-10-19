import 'package:mocktail/mocktail.dart';
import 'package:ignition_mobile/core/analytics_service.dart';

class MockAnalyticsService extends Mock implements AnalyticsService {}

/// Stub that silently accepts all event tracking calls — useful when analytics
/// side-effects are irrelevant to the test under scrutiny.
void stubAnalyticsNoOp(MockAnalyticsService mock) {
  when(() => mock.trackEvent(any(), parameters: any(named: 'parameters')))
      .thenAnswer((_) async {});
  when(() => mock.setUserId(any())).thenAnswer((_) async {});
  when(() => mock.logWalletConnect(any())).thenAnswer((_) async {});
  when(() => mock.logSendInitiated(
        assetCode: any(named: 'assetCode'),
        amount: any(named: 'amount'),
      )).thenAnswer((_) async {});
  when(() => mock.logSendConfirmed(
        assetCode: any(named: 'assetCode'),
        amount: any(named: 'amount'),
      )).thenAnswer((_) async {});
  when(() => mock.logReceiveViewed()).thenAnswer((_) async {});
  when(() => mock.logAnchorDepositStarted(any())).thenAnswer((_) async {});
}
