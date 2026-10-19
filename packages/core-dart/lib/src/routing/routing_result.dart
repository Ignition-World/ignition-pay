enum RoutingSource {
  muxed,
  memo,
  none;

  String toDisplayString() {
    switch (this) {
      case RoutingSource.muxed:
        return 'Routed via muxed address (M-address)';
      case RoutingSource.memo:
        return 'Routed via memo ID';
      case RoutingSource.none:
        return 'No routing source detected';
    }
  }
}

class RoutingWarning {
  final String code;
  final String severity;
  final String message;

  const RoutingWarning({
    required this.code,
    required this.severity,
    required this.message,
  });

  Map<String, dynamic> toJson() => {
        'code': code,
        'severity': severity,
        'message': message,
      };

  factory RoutingWarning.fromJson(Map<String, dynamic> json) {
    return RoutingWarning(
      code: json['code'] as String,
      severity: json['severity'] as String,
      message: json['message'] as String,
    );
  }

  static const memoIgnored = RoutingWarning(
    code: 'memo-ignored',
    severity: 'info',
    message: 'Memo ignored for muxed address',
  );

  static const contractSender = RoutingWarning(
    code: 'contract-sender',
    severity: 'info',
    message: 'Contract source detected. Routing state cleared.',
  );

  @override
  String toString() => '[$severity] $code: $message';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RoutingWarning &&
          runtimeType == other.runtimeType &&
          code == other.code &&
          severity == other.severity &&
          message == other.message;

  @override
  int get hashCode => Object.hash(code, severity, message);
}

class DestinationError {
  final String code;
  final String message;

  DestinationError({required this.code, required this.message});

  Map<String, dynamic> toJson() => {
        'code': code,
        'message': message,
      };

  factory DestinationError.fromJson(Map<String, dynamic> json) {
    return DestinationError(
      code: json['code'] as String,
      message: json['message'] as String,
    );
  }

  @override
  String toString() => 'DestinationError(code: $code, message: $message)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DestinationError &&
          runtimeType == other.runtimeType &&
          code == other.code &&
          message == other.message;

  @override
  int get hashCode => Object.hash(code, message);
}

class ExtractRoutingException implements Exception {
  final String message;
  const ExtractRoutingException(this.message);

  @override
  String toString() => 'ExtractRoutingException: $message';
}

class RoutingInput {
  final String destination;
  final String memoType;
  final String? memoValue;
  final String? sourceAccount;

  RoutingInput({
    required this.destination,
    required this.memoType,
    this.memoValue,
    this.sourceAccount,
  });

  Map<String, dynamic> toJson() => {
        'destination': destination,
        'memoType': memoType,
        if (memoValue != null) 'memoValue': memoValue,
        if (sourceAccount != null) 'sourceAccount': sourceAccount,
      };

  factory RoutingInput.fromJson(Map<String, dynamic> json) {
    return RoutingInput(
      destination: json['destination'] as String,
      memoType: json['memoType'] as String,
      memoValue: json['memoValue'] as String?,
      sourceAccount: json['sourceAccount'] as String?,
    );
  }
}

final class RoutingResult {
  final RoutingSource source;
  final BigInt? id;
  final List<RoutingWarning> warnings;
  final String? destinationBaseAccount;
  final DestinationError? destinationError;
  final String? memoType;
  final String? memoValue;

  RoutingResult({
    required this.source,
    this.id,
    List<RoutingWarning>? warnings,
    this.destinationBaseAccount,
    this.destinationError,
    this.memoType,
    this.memoValue,
  }) : warnings = List.unmodifiable(warnings ?? const []);

  Map<String, dynamic> toJson() => {
        'source': source.name,
        if (id != null) 'id': id.toString(),
        'warnings': warnings.map((w) => w.toJson()).toList(),
        if (destinationBaseAccount != null)
          'destinationBaseAccount': destinationBaseAccount,
        if (destinationError != null)
          'destinationError': destinationError!.toJson(),
        if (memoType != null) 'memoType': memoType,
        if (memoValue != null) 'memoValue': memoValue,
      };

  factory RoutingResult.fromJson(Map<String, dynamic> json) {
    return RoutingResult(
      source: RoutingSource.values.firstWhere(
        (e) => e.name == json['source'],
        orElse: () => RoutingSource.none,
      ),
      id: json['id'] != null ? BigInt.parse(json['id'] as String) : null,
      warnings: (json['warnings'] as List<dynamic>?)
              ?.map((w) =>
                  RoutingWarning.fromJson(w as Map<String, dynamic>))
              .toList() ??
          [],
      destinationBaseAccount: json['destinationBaseAccount'] as String?,
      destinationError: json['destinationError'] != null
          ? DestinationError.fromJson(
              json['destinationError'] as Map<String, dynamic>)
          : null,
      memoType: json['memoType'] as String?,
      memoValue: json['memoValue'] as String?,
    );
  }

  String toDisplayString() {
    switch (source) {
      case RoutingSource.muxed:
        final idStr = id?.toString() ?? 'unknown';
        final base = destinationBaseAccount ?? 'unknown';
        return 'Muxed routing: ID $idStr -> $base';
      case RoutingSource.memo:
        final idStr = id?.toString() ?? 'unknown';
        final memo = memoType != null ? ' (memoType: $memoType, memoValue: $memoValue)' : '';
        return 'Memo routing: ID $idStr$memo';
      case RoutingSource.none:
        return 'No routing detected';
    }
  }

  @override
  String toString() =>
      'RoutingResult(source: $source, id: $id, warnings: $warnings, destinationBaseAccount: $destinationBaseAccount, destinationError: $destinationError, memoType: $memoType, memoValue: $memoValue)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RoutingResult &&
          source == other.source &&
          id == other.id &&
          destinationBaseAccount == other.destinationBaseAccount &&
          destinationError == other.destinationError &&
          memoType == other.memoType &&
          memoValue == other.memoValue &&
          _listEquals(warnings, other.warnings);

  @override
  int get hashCode => Object.hash(source, id, destinationBaseAccount,
      destinationError, memoType, memoValue, Object.hashAll(warnings));

  static bool _listEquals(List<RoutingWarning> a, List<RoutingWarning> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}




