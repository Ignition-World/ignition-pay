/// Lifecycle of a locally persisted send draft.
enum DraftStatus {
  /// Saved locally, waiting for connectivity.
  pending('pending'),

  /// Currently being submitted.
  submitting('submitting'),

  /// Broadcast successfully.
  sent('sent'),

  /// A submission attempt failed; eligible for retry.
  failed('failed'),

  /// Cancelled by the user or expired.
  cancelled('cancelled');

  const DraftStatus(this.wireName);

  /// Stable string persisted in the database.
  final String wireName;

  /// Parses a persisted [wireName]; unknown values degrade to [pending].
  static DraftStatus fromWire(String value) => DraftStatus.values.firstWhere(
        (status) => status.wireName == value,
        orElse: () => DraftStatus.pending,
      );
}

/// A send transaction the user started while offline.
///
/// Drafts are persisted in a local database (see `DraftStore`) and submitted
/// automatically once connectivity returns (issue #678).
class TransactionDraft {
  const TransactionDraft({
    required this.id,
    required this.recipient,
    required this.amount,
    required this.asset,
    required this.createdAt,
    this.memo,
    this.feeEstimate,
    this.status = DraftStatus.pending,
    this.lastAttemptAt,
    this.errorMessage,
  });

  final String id;
  final String recipient;
  final String amount;
  final String asset;
  final DateTime createdAt;
  final String? memo;
  final String? feeEstimate;
  final DraftStatus status;
  final DateTime? lastAttemptAt;
  final String? errorMessage;

  /// Default age after which an unsent draft is auto-cancelled.
  static const Duration defaultMaxAge = Duration(days: 7);

  /// Whether the draft still needs to be broadcast.
  bool get isSubmittable =>
      status == DraftStatus.pending || status == DraftStatus.failed;

  /// Whether the draft has been finalised (sent or cancelled).
  bool get isSettled =>
      status == DraftStatus.sent || status == DraftStatus.cancelled;

  /// Whether the draft is older than [maxAge] as of [now].
  bool isExpired(
    DateTime now, {
    Duration maxAge = defaultMaxAge,
  }) =>
      now.difference(createdAt) > maxAge;

  TransactionDraft copyWith({
    String? id,
    String? recipient,
    String? amount,
    String? asset,
    DateTime? createdAt,
    String? memo,
    String? feeEstimate,
    DraftStatus? status,
    DateTime? lastAttemptAt,
    String? errorMessage,
    bool clearError = false,
  }) {
    return TransactionDraft(
      id: id ?? this.id,
      recipient: recipient ?? this.recipient,
      amount: amount ?? this.amount,
      asset: asset ?? this.asset,
      createdAt: createdAt ?? this.createdAt,
      memo: memo ?? this.memo,
      feeEstimate: feeEstimate ?? this.feeEstimate,
      status: status ?? this.status,
      lastAttemptAt: lastAttemptAt ?? this.lastAttemptAt,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }

  @override
  String toString() =>
      'TransactionDraft($id, $amount $asset -> $recipient, ${status.wireName})';
}
