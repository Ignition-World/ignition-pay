/// Payment details decoded from a scanned QR code or a pasted payment URI.
class ScannedPaymentData {
  const ScannedPaymentData({
    required this.address,
    this.amount,
    this.asset,
    this.memo,
  });

  /// The Stellar destination address (`G...`).
  final String address;

  /// Optional amount encoded in the QR/URI.
  final String? amount;

  /// Optional asset code (e.g. `USDC`); null when the code does not specify one.
  final String? asset;

  /// Optional memo encoded in the QR/URI.
  final String? memo;

  /// Whether the payload carried an explicit amount.
  bool get hasAmount => amount != null && amount!.isNotEmpty;

  /// Whether the payload carried an explicit memo.
  bool get hasMemo => memo != null && memo!.isNotEmpty;

  @override
  String toString() =>
      'ScannedPaymentData(address: $address, amount: $amount, asset: $asset, memo: $memo)';
}

/// Parses the raw value of a scanned QR code into [ScannedPaymentData].
///
/// Supported payloads:
/// * a bare Stellar address — `GABC...`
/// * a SEP-0007 style URI — `stellar:GABC...?amount=10&asset=USDC&memo=hi`
/// * the app deep link — `ignitionpay://pay/GABC...?amount=10&asset=USDC`
/// * a universal link — `https://ignitionpay.com/pay/GABC...?amount=10`
///
/// Anything else (including reservations with a non-Stellar destination)
/// returns `null` so the caller can surface an "invalid code" message.
class AddressScanParser {
  const AddressScanParser._();

  /// Stellar account IDs are a `G` followed by 55 base-32 characters.
  static final RegExp _stellarAddress = RegExp(r'^G[A-Z2-7]{55}$');

  /// Hosts whose universal links resolve to in-app payment routes.
  static const Set<String> _supportedHosts = <String>{
    'ignitionpay.com',
    'www.ignitionpay.com',
  };

  /// Whether [value] is a well-formed Stellar account id.
  static bool isStellarAddress(String value) =>
      _stellarAddress.hasMatch(value.trim());

  /// Parses [raw]; returns null when it is not a supported payment payload.
  static ScannedPaymentData? parse(String raw) {
    final input = raw.trim();
    if (input.isEmpty) return null;

    if (isStellarAddress(input)) {
      return ScannedPaymentData(address: input);
    }

    final uri = Uri.tryParse(input);
    if (uri == null) return null;
    final query = uri.queryParameters;

    // stellar:<address>?amount=...&asset=...&memo=...
    if (uri.scheme == 'stellar') {
      final address =
          _firstAddress(<String?>[uri.path, query['destination']]);
      return address == null
          ? null
          : ScannedPaymentData(
              address: address,
              amount: query['amount'],
              asset: query['asset'],
              memo: query['memo'],
            );
    }

    // ignitionpay://pay/<address>?amount=...&asset=...&memo=...
    if (uri.scheme == 'ignitionpay') {
      return _fromSegments(
        <String>[if (uri.host.isNotEmpty) uri.host, ...uri.pathSegments],
        query,
      );
    }

    // https://ignitionpay.com/pay/<address>?amount=...
    if ((uri.scheme == 'http' || uri.scheme == 'https') &&
        _supportedHosts.contains(uri.host)) {
      return _fromSegments(uri.pathSegments, query);
    }

    return null;
  }

  static ScannedPaymentData? _fromSegments(
    List<String> segments,
    Map<String, String> query,
  ) {
    final address =
        _firstAddress(<String?>[...segments, query['destination']]);
    if (address == null) return null;
    return ScannedPaymentData(
      address: address,
      amount: query['amount'],
      asset: query['asset'],
      memo: query['memo'],
    );
  }

  static String? _firstAddress(Iterable<String?> candidates) {
    for (final candidate in candidates) {
      if (candidate != null && isStellarAddress(candidate)) {
        return candidate.trim();
      }
    }
    return null;
  }
}
