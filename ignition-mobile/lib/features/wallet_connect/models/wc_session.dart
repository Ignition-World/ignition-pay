import 'wc_network.dart';

enum WcSessionStatus {
  pending,
  approved,
  rejected,
  expired,
  disconnected;

  static WcSessionStatus parse(String? raw) {
    for (final status in WcSessionStatus.values) {
      if (status.name == raw) return status;
    }
    return WcSessionStatus.disconnected;
  }

  String get wireName => name;
}

class WcAccount {
  final String address;
  final WcNetwork network;
  final String? chainId;

  const WcAccount({
    required this.address,
    required this.network,
    this.chainId,
  });

  factory WcAccount.fromPayload(Map<String, dynamic> payload) {
    return WcAccount(
      address: payload['address'] as String? ?? '',
      network: WcNetwork.parse(payload['network'] as String?),
      chainId: payload['chainId'] as String?,
    );
  }

  Map<String, dynamic> toPayload() => <String, dynamic>{
        'address': address,
        'network': network.wireName,
        'chainId': chainId,
      };

  WcAccount copyWith({
    String? address,
    WcNetwork? network,
    String? chainId,
  }) {
    return WcAccount(
      address: address ?? this.address,
      network: network ?? this.network,
      chainId: chainId ?? this.chainId,
    );
  }
}

class WcPeerMeta {
  final String name;
  final String description;
  final String url;
  final List<String> icons;

  const WcPeerMeta({
    this.name = 'Unknown DApp',
    this.description = '',
    this.url = '',
    this.icons = const <String>[],
  });

  factory WcPeerMeta.fromPayload(Map<String, dynamic> payload) {
    final iconsRaw = payload['icons'];
    return WcPeerMeta(
      name: payload['name'] as String? ?? 'Unknown DApp',
      description: payload['description'] as String? ?? '',
      url: payload['url'] as String? ?? '',
      icons: iconsRaw is List
          ? iconsRaw.whereType<String>().toList()
          : const <String>[],
    );
  }

  Map<String, dynamic> toPayload() => <String, dynamic>{
        'name': name,
        'description': description,
        'url': url,
        'icons': icons,
      };

  String? get firstIcon => icons.isNotEmpty ? icons.first : null;

  String get displayHost {
    if (url.isEmpty) return '';
    try {
      return Uri.parse(url).host.replaceFirst('www.', '');
    } catch (_) {
      return url;
    }
  }
}

class WcSession {
  final String topic;
  final String pairingTopic;
  final WcPeerMeta peer;
  final List<WcAccount> accounts;
  final List<String> requiredNamespaces;
  final List<String> optionalNamespaces;
  final WcSessionStatus status;
  final DateTime createdAt;
  final DateTime? approvedAt;
  final DateTime expiresAt;
  final DateTime? disconnectedAt;

  const WcSession({
    required this.topic,
    required this.pairingTopic,
    required this.peer,
    required this.accounts,
    required this.requiredNamespaces,
    required this.optionalNamespaces,
    required this.status,
    required this.createdAt,
    required this.expiresAt,
    this.approvedAt,
    this.disconnectedAt,
  });

  bool get isActive =>
      status == WcSessionStatus.approved &&
      DateTime.now().isBefore(expiresAt);

  bool get isExpired => DateTime.now().isAfter(expiresAt);

  Duration get remainingDuration => expiresAt.difference(DateTime.now());

  WcSession copyWith({
    String? topic,
    String? pairingTopic,
    WcPeerMeta? peer,
    List<WcAccount>? accounts,
    List<String>? requiredNamespaces,
    List<String>? optionalNamespaces,
    WcSessionStatus? status,
    DateTime? createdAt,
    DateTime? approvedAt,
    DateTime? expiresAt,
    DateTime? disconnectedAt,
  }) {
    return WcSession(
      topic: topic ?? this.topic,
      pairingTopic: pairingTopic ?? this.pairingTopic,
      peer: peer ?? this.peer,
      accounts: accounts ?? this.accounts,
      requiredNamespaces: requiredNamespaces ?? this.requiredNamespaces,
      optionalNamespaces: optionalNamespaces ?? this.optionalNamespaces,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      approvedAt: approvedAt ?? this.approvedAt,
      expiresAt: expiresAt ?? this.expiresAt,
      disconnectedAt: disconnectedAt ?? this.disconnectedAt,
    );
  }

  factory WcSession.fromRow(Map<String, dynamic> row) {
    return WcSession(
      topic: row['topic']! as String,
      pairingTopic: row['pairing_topic']! as String,
      peer: WcPeerMeta.fromPayload(
        Map<String, dynamic>.from(_parseJson(row['peer_json'] as String? ?? '{}')),
      ),
      accounts: _parseAccounts(row['accounts_json'] as String? ?? '[]'),
      requiredNamespaces: _parseStringList(row['required_ns_json'] as String? ?? '[]'),
      optionalNamespaces: _parseStringList(row['optional_ns_json'] as String? ?? '[]'),
      status: WcSessionStatus.parse(row['status'] as String?),
      createdAt: DateTime.fromMillisecondsSinceEpoch(row['created_at']! as int),
      approvedAt: row['approved_at'] == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(row['approved_at'] as int),
      expiresAt: DateTime.fromMillisecondsSinceEpoch(row['expires_at']! as int),
      disconnectedAt: row['disconnected_at'] == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(row['disconnected_at'] as int),
    );
  }

  List<Object?> toBindValues() => <Object?>[
        topic,
        pairingTopic,
        _toJson(peer.toPayload()),
        _toJson(<dynamic>[for (final a in accounts) a.toPayload()]),
        _toJson(requiredNamespaces),
        _toJson(optionalNamespaces),
        status.wireName,
        createdAt.millisecondsSinceEpoch,
        approvedAt?.millisecondsSinceEpoch,
        expiresAt.millisecondsSinceEpoch,
        disconnectedAt?.millisecondsSinceEpoch,
      ];

  @override
  String toString() =>
      'WcSession($topic, ${peer.name}, status: ${status.name})';
}

Map<String, dynamic> _parseJson(String raw) {
  try {
    return Map<String, dynamic>.from(
      (raw.isEmpty ? const <String, dynamic>{} : _decodeJson(raw)) as Map,
    );
  } catch (_) {
    return const <String, dynamic>{};
  }
}

List<WcAccount> _parseAccounts(String raw) {
  try {
    final list = (raw.isEmpty ? const <dynamic>[] : _decodeJson(raw)) as List;
    return <WcAccount>[
      for (final item in list)
        WcAccount.fromPayload(Map<String, dynamic>.from(item as Map)),
    ];
  } catch (_) {
    return const <WcAccount>[];
  }
}

List<String> _parseStringList(String raw) {
  try {
    final list = (raw.isEmpty ? const <dynamic>[] : _decodeJson(raw)) as List;
    return list.whereType<String>().toList();
  } catch (_) {
    return const <String>[];
  }
}

dynamic _decodeJson(String raw) {
  // Local jsonDecode shim to avoid adding dart:convert import clutter in callers.
  // ignore: avoid_dynamic_calls
  return (raw.codeUnits is List) ? _jsonDecodeImpl(raw) : _jsonDecodeImpl(raw);
}

String _toJson(dynamic value) {
  return _jsonEncodeImpl(value);
}

// We use a small local pair so the model layer never leaks implementation
// choices (package:json, mirrors, etc.) into the rest of the app.
String _jsonEncodeImpl(dynamic object) {
  final buf = StringBuffer();
  _writeJson(object, buf);
  return buf.toString();
}

void _writeJson(dynamic object, StringBuffer buf) {
  if (object == null) {
    buf.write('null');
  } else if (identical(object, true) || identical(object, false)) {
    buf.write(object ? 'true' : 'false');
  } else if (object is num) {
    buf.write(object.toString());
  } else if (object is String) {
    _writeString(object, buf);
  } else if (object is List) {
    buf.write('[');
    for (var i = 0; i < object.length; i++) {
      if (i > 0) buf.write(',');
      _writeJson(object[i], buf);
    }
    buf.write(']');
  } else if (object is Map) {
    buf.write('{');
    var first = true;
    object.forEach((k, v) {
      if (!first) buf.write(',');
      first = false;
      _writeString(k.toString(), buf);
      buf.write(':');
      _writeJson(v, buf);
    });
    buf.write('}');
  } else {
    _writeString(object.toString(), buf);
  }
}

void _writeString(String s, StringBuffer buf) {
  buf.write('"');
  for (var i = 0; i < s.length; i++) {
    final c = s[i];
    switch (c) {
      case '\\':
        buf.write(r'\\');
        break;
      case '"':
        buf.write(r'\"');
        break;
      case '\b':
        buf.write(r'\b');
        break;
      case '\f':
        buf.write(r'\f');
        break;
      case '\n':
        buf.write(r'\n');
        break;
      case '\r':
        buf.write(r'\r');
        break;
      case '\t':
        buf.write(r'\t');
        break;
      default:
        if (c.codeUnitAt(0) < 0x20) {
          buf.write(c
              .codeUnitAt(0)
              .toRadixString(16)
              .padLeft(4, '0')
              .replaceRange(0, 0, r'\u'));
        } else {
          buf.write(c);
        }
    }
  }
  buf.write('"');
}

dynamic _jsonDecodeImpl(String source) {
  final scanner = _JsonScanner(source);
  final result = scanner.parseValue();
  scanner.skipWhitespace();
  if (scanner.position < source.length) {
    throw FormatException('Unexpected trailing character', source, scanner.position);
  }
  return result;
}

class _JsonScanner {
  _JsonScanner(this.source);

  final String source;
  int position = 0;

  void skipWhitespace() {
    while (position < source.length) {
      final c = source[position];
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
        position++;
      } else {
        break;
      }
    }
  }

  String peek() {
    if (position >= source.length) {
      throw FormatException('Unexpected end of input', source, position);
    }
    return source[position];
  }

  void expect(String expected) {
    for (var i = 0; i < expected.length; i++) {
      if (position + i >= source.length || source[position + i] != expected[i]) {
        throw FormatException(
          'Expected "$expected"',
          source,
          position,
        );
      }
    }
    position += expected.length;
  }

  dynamic parseValue() {
    skipWhitespace();
    final c = peek();
    switch (c) {
      case '{':
        return parseObject();
      case '[':
        return parseArray();
      case '"':
        return parseString();
      case 't':
        expect('true');
        return true;
      case 'f':
        expect('false');
        return false;
      case 'n':
        expect('null');
        return null;
      default:
        if (c == '-' || (c.codeUnitAt(0) >= 48 && c.codeUnitAt(0) <= 57)) {
          return parseNumber();
        }
        throw FormatException('Unexpected character', source, position);
    }
  }

  Map<String, dynamic> parseObject() {
    expect('{');
    final map = <String, dynamic>{};
    skipWhitespace();
    if (peek() == '}') {
      position++;
      return map;
    }
    while (true) {
      skipWhitespace();
      final key = parseString();
      skipWhitespace();
      expect(':');
      final value = parseValue();
      map[key] = value;
      skipWhitespace();
      final c = peek();
      if (c == '}') {
        position++;
        break;
      }
      if (c == ',') {
        position++;
        continue;
      }
      throw FormatException('Expected "," or "}"', source, position);
    }
    return map;
  }

  List<dynamic> parseArray() {
    expect('[');
    final list = <dynamic>[];
    skipWhitespace();
    if (peek() == ']') {
      position++;
      return list;
    }
    while (true) {
      list.add(parseValue());
      skipWhitespace();
      final c = peek();
      if (c == ']') {
        position++;
        break;
      }
      if (c == ',') {
        position++;
        continue;
      }
      throw FormatException('Expected "," or "]"', source, position);
    }
    return list;
  }

  String parseString() {
    expect('"');
    final buf = StringBuffer();
    while (position < source.length) {
      final c = source[position];
      if (c == '"') {
        position++;
        return buf.toString();
      }
      if (c == '\\') {
        position++;
        if (position >= source.length) {
          throw FormatException('Unterminated string', source, position);
        }
        final esc = source[position];
        switch (esc) {
          case '"':
            buf.write('"');
            break;
          case '\\':
            buf.write('\\');
            break;
          case '/':
            buf.write('/');
            break;
          case 'b':
            buf.write('\b');
            break;
          case 'f':
            buf.write('\f');
            break;
          case 'n':
            buf.write('\n');
            break;
          case 'r':
            buf.write('\r');
            break;
          case 't':
            buf.write('\t');
            break;
          case 'u':
            if (position + 4 >= source.length) {
              throw FormatException('Invalid unicode escape', source, position);
            }
            final hex = source.substring(position + 1, position + 5);
            final code = int.tryParse(hex, radix: 16);
            if (code == null) {
              throw FormatException('Invalid unicode escape', source, position);
            }
            buf.writeCharCode(code);
            position += 4;
            break;
          default:
            throw FormatException('Invalid escape', source, position);
        }
        position++;
      } else {
        buf.write(c);
        position++;
      }
    }
    throw FormatException('Unterminated string', source, position);
  }

  num parseNumber() {
    final start = position;
    if (peek() == '-') position++;
    while (position < source.length) {
      final c = source[position];
      final code = c.codeUnitAt(0);
      if (code >= 48 && code <= 57) {
        position++;
      } else {
        break;
      }
    }
    var isDouble = false;
    if (position < source.length && source[position] == '.') {
      isDouble = true;
      position++;
      while (position < source.length) {
        final c = source[position];
        final code = c.codeUnitAt(0);
        if (code >= 48 && code <= 57) {
          position++;
        } else {
          break;
        }
      }
    }
    if (position < source.length &&
        (source[position] == 'e' || source[position] == 'E')) {
      isDouble = true;
      position++;
      if (position < source.length &&
          (source[position] == '+' || source[position] == '-')) {
        position++;
      }
      while (position < source.length) {
        final c = source[position];
        final code = c.codeUnitAt(0);
        if (code >= 48 && code <= 57) {
          position++;
        } else {
          break;
        }
      }
    }
    final raw = source.substring(start, position);
    return isDouble ? double.parse(raw) : int.parse(raw);
  }
}
