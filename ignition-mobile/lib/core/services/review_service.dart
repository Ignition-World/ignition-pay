import 'package:in_app_review/in_app_review.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Smart in-app review prompts after meaningful milestones (issue #706).
class ReviewService {
  ReviewService({InAppReview? inAppReview})
      : _inAppReview = inAppReview ?? InAppReview.instance;

  static const _kTxCount = 'review_tx_sent_count';
  static const _kFirstOpen = 'review_first_open_ms';
  static const _kNever = 'review_never';
  static const _kRemindAfter = 'review_remind_after_ms';
  static const _kLastPrompt = 'review_last_prompt_ms';

  final InAppReview _inAppReview;

  static const txMilestone = 5;
  static const activeDays = 7;
  static const remindDays = 7;
  static const cooldownDays = 30;

  Future<void> recordAppOpen() async {
    final prefs = await SharedPreferences.getInstance();
    if (!prefs.containsKey(_kFirstOpen)) {
      await prefs.setInt(_kFirstOpen, DateTime.now().millisecondsSinceEpoch);
    }
  }

  Future<void> recordTransactionSent() async {
    final prefs = await SharedPreferences.getInstance();
    final next = (prefs.getInt(_kTxCount) ?? 0) + 1;
    await prefs.setInt(_kTxCount, next);
  }

  Future<void> remindLater() async {
    final prefs = await SharedPreferences.getInstance();
    final when =
        DateTime.now().add(const Duration(days: remindDays)).millisecondsSinceEpoch;
    await prefs.setInt(_kRemindAfter, when);
  }

  Future<void> neverAsk() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kNever, true);
  }

  /// Returns false during critical flows when [suppress] is true.
  Future<bool> shouldPrompt({required bool suppress}) async {
    if (suppress) return false;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_kNever) == true) return false;

    final now = DateTime.now().millisecondsSinceEpoch;
    final remindAfter = prefs.getInt(_kRemindAfter) ?? 0;
    if (remindAfter > now) return false;

    final last = prefs.getInt(_kLastPrompt) ?? 0;
    if (last > 0 &&
        now - last < const Duration(days: cooldownDays).inMilliseconds) {
      return false;
    }

    final txCount = prefs.getInt(_kTxCount) ?? 0;
    final firstOpen = prefs.getInt(_kFirstOpen) ?? now;
    final daysActive =
        (now - firstOpen) / const Duration(days: 1).inMilliseconds;
    return txCount >= txMilestone || daysActive >= activeDays;
  }

  Future<bool> maybePrompt({required bool suppress}) async {
    if (!await shouldPrompt(suppress: suppress)) return false;
    if (!await _inAppReview.isAvailable()) return false;
    await _inAppReview.requestReview();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_kLastPrompt, DateTime.now().millisecondsSinceEpoch);
    return true;
  }
}
