import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/services/review_service.dart';

void main() {
  test('review milestone constants match acceptance criteria', () {
    expect(ReviewService.txMilestone, 5);
    expect(ReviewService.activeDays, 7);
    expect(ReviewService.remindDays, 7);
    expect(ReviewService.cooldownDays, 30);
  });
}
