/// Network fee estimate for a pending send transaction.
class FeeEstimate {
  const FeeEstimate({
    required this.feeAmount,
    required this.assetCode,
    this.fiatAmount,
    this.fiatCurrency = 'USD',
    this.minimumNetworkFee,
    this.feeType,
  });

  /// The estimated transaction fee amount in native/token units.
  final String feeAmount;

  /// The asset code of the fee (e.g. `XLM`).
  final String assetCode;

  /// Approximate fiat value (e.g. `0.01` or `0.00012`).
  final String? fiatAmount;

  /// Fiat currency code (e.g. `USD`, `EUR`).
  final String fiatCurrency;

  /// Minimum network base fee if applicable (e.g. `0.00001`).
  final String? minimumNetworkFee;

  /// Type of fee calculation (e.g. `standard`, `priority`).
  final String? feeType;

  /// Formatted string showing native asset fee (e.g. `0.00001 XLM`).
  String get formattedNative => '$feeAmount $assetCode';

  /// Formatted string showing approximate fiat equivalent (e.g. `≈ $0.01 USD` or `≈ 0.01 USD`).
  String? get formattedFiat {
    if (fiatAmount == null || fiatAmount!.isEmpty) return null;
    final symbol = fiatCurrency == 'USD' ? '$' : '';
    return '≈ $symbol$fiatAmount ${fiatCurrency != 'USD' ? fiatCurrency : ''}'.trim();
  }

  /// Whether a minimum network comparison is available and distinct.
  bool get hasComparison =>
      minimumNetworkFee != null &&
      minimumNetworkFee!.isNotEmpty &&
      minimumNetworkFee != feeAmount;

  /// Factory constructor to parse fee response from API payloads.
  /// Supports various formats:
  /// - Direct fee object: `{ "feeAmount": "0.00001", "assetCode": "XLM", "fiatAmount": "0.0001", ... }`
  /// - Snake case: `{ "fee_amount": "0.00001", "fee_asset_code": "XLM", ... }`
  /// - Nested data / Wrapped BaseResponse: `{ "data": { "feeAmount": ... } }`
  /// - Generic fee response: `{ "fee": "0.00001", "asset": "XLM" }`
  factory FeeEstimate.fromJson(Map<String, dynamic> raw) {
    final Map<String, dynamic> json =
        raw.containsKey('data') && raw['data'] is Map<String, dynamic>
            ? Map<String, dynamic>.from(raw['data'] as Map)
            : raw;

    final feeAmount = (json['feeAmount'] ??
            json['fee_amount'] ??
            json['fee'] ??
            json['estimatedFee'] ??
            json['estimated_fee'] ??
            json['total'])
        ?.toString() ??
        '0.00001';

    final assetCode = (json['assetCode'] ??
            json['feeAssetCode'] ??
            json['asset_code'] ??
            json['fee_asset_code'] ??
            json['asset'])
        ?.toString() ??
        'XLM';

    final fiatAmount = (json['fiatAmount'] ??
            json['fiat_amount'] ??
            json['fiatEquivalent'] ??
            json['fiat_equivalent'] ??
            json['approximateFiat'] ??
            json['approximate_fiat'])
        ?.toString();

    final fiatCurrency = (json['fiatCurrency'] ??
            json['fiat_currency'] ??
            json['currency'])
        ?.toString() ??
        'USD';

    final minimumNetworkFee = (json['minimumNetworkFee'] ??
            json['minimum_network_fee'] ??
            json['minFee'] ??
            json['min_fee'] ??
            json['baseFee'] ??
            json['base_fee'])
        ?.toString();

    final feeType =
        (json['feeType'] ?? json['fee_type'] ?? json['type'])?.toString();

    return FeeEstimate(
      feeAmount: feeAmount,
      assetCode: assetCode,
      fiatAmount: fiatAmount,
      fiatCurrency: fiatCurrency,
      minimumNetworkFee: minimumNetworkFee,
      feeType: feeType,
    );
  }

  Map<String, dynamic> toJson() => {
        'feeAmount': feeAmount,
        'assetCode': assetCode,
        if (fiatAmount != null) 'fiatAmount': fiatAmount,
        'fiatCurrency': fiatCurrency,
        if (minimumNetworkFee != null) 'minimumNetworkFee': minimumNetworkFee,
        if (feeType != null) 'feeType': feeType,
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is FeeEstimate &&
          runtimeType == other.runtimeType &&
          feeAmount == other.feeAmount &&
          assetCode == other.assetCode &&
          fiatAmount == other.fiatAmount &&
          fiatCurrency == other.fiatCurrency &&
          minimumNetworkFee == other.minimumNetworkFee &&
          feeType == other.feeType;

  @override
  int get hashCode => Object.hash(
        feeAmount,
        assetCode,
        fiatAmount,
        fiatCurrency,
        minimumNetworkFee,
        feeType,
      );

  @override
  String toString() =>
      'FeeEstimate($feeAmount $assetCode, fiat: $fiatAmount $fiatCurrency, min: $minimumNetworkFee)';
}
