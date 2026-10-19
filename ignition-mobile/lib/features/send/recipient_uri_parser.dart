/// Result of parsing a scanned/pasted recipient string.
class RecipientUriParseResult {
  final String? address;
  final String? amount;
  final String? memo;

  const RecipientUriParseResult({this.address, this.amount, this.memo});
}

/// Parses a `stellar:` payment URI (e.g. from a scanned QR code or a
/// pasted string) into its destination address, amount, and memo so the
/// send flow can be prefilled from a single input.
class RecipientUriParser {
  /// Parses [input], which may be a bare Stellar address or a
  /// `stellar:<address>?amount=...&memo=...` URI.
  static RecipientUriParseResult parse(String input) {
    final trimmed = input.trim();
    if (!trimmed.toLowerCase().startsWith('stellar:')) {
      return RecipientUriParseResult(
        address: trimmed.isEmpty ? null : trimmed,
      );
    }

    final uri = Uri.tryParse(trimmed);
    if (uri == null) return const RecipientUriParseResult();

    final address = uri.path.isNotEmpty ? uri.path : null;
    return RecipientUriParseResult(
      address: address,
      amount: uri.queryParameters['amount'],
      memo: uri.queryParameters['memo'],
    );
  }
}
