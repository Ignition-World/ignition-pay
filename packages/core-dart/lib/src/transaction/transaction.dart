import 'dart:convert';
import 'dart:typed_data';
import 'package:convert/convert.dart' as convert;
import 'package:meta/meta.dart';
import '../util/strkey.dart';

// ---------------------------------------------------------------------------
// XDR encoding helpers (inline, no external dependency)
// ---------------------------------------------------------------------------

/// Minimal XDR byte-buffer writer for Stellar transaction encoding.
///
/// Stellar's XDR encoding is big-endian and pads strings / opaque blobs to
/// the next 4-byte boundary.  See:
/// https://github.com/stellar/stellar-xdr/blob/curr/Stellar-transaction.x
class _XdrWriter {
  final _buf = BytesBuilder(copy: false);

  /// Appends a 32-bit signed integer (big-endian).
  void writeInt32(int v) {
    _buf.add([
      (v >> 24) & 0xFF,
      (v >> 16) & 0xFF,
      (v >> 8) & 0xFF,
      v & 0xFF,
    ]);
  }

  /// Appends a 32-bit unsigned integer (big-endian).
  void writeUint32(int v) => writeInt32(v);

  /// Appends a 64-bit signed integer (big-endian).
  void writeInt64(int v) {
    writeInt32((v >> 32) & 0xFFFFFFFF);
    writeInt32(v & 0xFFFFFFFF);
  }

  /// Appends a 64-bit unsigned integer (big-endian).
  void writeUint64(int v) => writeInt64(v);

  /// Appends a 64-bit integer from a [BigInt] (big-endian).
  void writeBigInt64(BigInt v) {
    final hi = ((v >> 32) & BigInt.from(0xFFFFFFFF)).toInt();
    final lo = (v & BigInt.from(0xFFFFFFFF)).toInt();
    writeInt32(hi);
    writeInt32(lo);
  }

  /// Appends raw bytes with no padding.
  void writeRaw(List<int> bytes) => _buf.add(bytes);

  /// Appends [n] bytes of XDR opaque fixed-length data, padding to 4 bytes.
  void writeOpaque(List<int> bytes, int n) {
    _buf.add(bytes.take(n).toList());
    final pad = (4 - (n % 4)) % 4;
    for (var i = 0; i < pad; i++) {
      _buf.addByte(0);
    }
  }

  /// Appends an XDR variable-length opaque blob (length prefix + data + pad).
  void writeVarOpaque(List<int> bytes) {
    writeUint32(bytes.length);
    writeRaw(bytes);
    final pad = (4 - (bytes.length % 4)) % 4;
    for (var i = 0; i < pad; i++) {
      _buf.addByte(0);
    }
  }

  /// Appends an XDR string (same layout as variable-length opaque).
  void writeString(String s) => writeVarOpaque(utf8.encode(s));

  Uint8List toBytes() => Uint8List.fromList(_buf.toBytes());
}

// ---------------------------------------------------------------------------
// XDR encoding for a Stellar G-address
// ---------------------------------------------------------------------------

/// Encodes a Stellar G-address as a 36-byte XDR `AccountID`:
/// `4 bytes type discriminant (0) + 32 bytes public key`.
Uint8List _encodeAccountId(String gAddress) {
  final decoded = StrKeyUtil.decodeBase32(gAddress);
  // decoded = [versionByte(1), pubkey(32), checksum(2)] = 35 bytes
  final pubKey = decoded.sublist(1, 33);
  final w = _XdrWriter();
  w.writeUint32(0); // PUBLIC_KEY_TYPE_ED25519 = 0
  w.writeOpaque(pubKey, 32);
  return w.toBytes();
}

// ---------------------------------------------------------------------------
// Transaction model
// ---------------------------------------------------------------------------

/// Represents a payment operation in a Stellar transaction.
@immutable
class PaymentOperation {
  /// The destination address (G, M, or C).
  final String destination;

  /// The asset code (e.g., 'XLM', 'USDC').
  final String asset;

  /// The amount to send as a string to preserve precision.
  final String amount;

  const PaymentOperation({
    required this.destination,
    required this.asset,
    required this.amount,
  });

  Map<String, dynamic> toJson() => {
        'type': 'payment',
        'destination': destination,
        'asset': asset,
        'amount': amount,
      };

  /// Encodes this operation as Stellar XDR bytes.
  ///
  /// Layout (Payment operation, type discriminant = 1):
  /// ```
  ///   [4]  optional source account present (0 = absent)
  ///   [4]  operation type = 1 (PAYMENT)
  ///   [36] destination AccountID
  ///   [4]  asset type (0 = ASSET_TYPE_NATIVE for XLM)
  ///        or [4+4+4] for issued asset
  ///   [8]  amount in stroops (int64)
  /// ```
  Uint8List toXdrBytes() {
    final w = _XdrWriter();

    // Optional source account — not present.
    w.writeUint32(0);

    // Operation type = 1 (PAYMENT).
    w.writeUint32(1);

    // Destination AccountID.
    w.writeRaw(_encodeAccountId(destination));

    // Asset.
    if (asset == 'XLM') {
      // ASSET_TYPE_NATIVE = 0
      w.writeUint32(0);
    } else {
      // ASSET_TYPE_CREDIT_ALPHANUM4 = 1 (up to 4 chars)
      // ASSET_TYPE_CREDIT_ALPHANUM12 = 2 (up to 12 chars)
      final code = asset.padRight(asset.length <= 4 ? 4 : 12);
      final isAlpha4 = asset.length <= 4;
      w.writeUint32(isAlpha4 ? 1 : 2);
      // Asset code (4 or 12 bytes, null-padded)
      w.writeOpaque(utf8.encode(code), isAlpha4 ? 4 : 12);
      // Issuer — for a complete implementation the caller supplies the issuer
      // G-address.  Since PaymentOperation does not currently carry an issuer
      // field we write a 36-byte zeroed placeholder so the XDR frame is valid.
      w.writeRaw(Uint8List(36));
    }

    // Amount: convert decimal string to stroops (int64).
    // 1 XLM = 10,000,000 stroops.
    final amountStroops = _amountToStroops(amount);
    w.writeBigInt64(amountStroops);

    return w.toBytes();
  }
}

/// Parses a decimal amount string and returns the equivalent value in stroops.
///
/// Stellars smallest unit is 1 stroop = 0.0000001 XLM (1e-7).
BigInt _amountToStroops(String amount) {
  final parts = amount.split('.');
  final intPart = BigInt.parse(parts[0]) * BigInt.from(10000000);
  if (parts.length == 1) return intPart;

  // Right-pad or truncate the fractional part to 7 decimal places.
  var frac = parts[1].padRight(7, '0').substring(0, 7);
  return intPart + BigInt.parse(frac);
}

/// Represents a Stellar transaction before signing.
@immutable
class Transaction {
  /// The source account address.
  final String sourceAccount;

  /// The sequence number for the transaction.
  final BigInt sequenceNumber;

  /// The fee (in stroops) for the transaction.
  final int fee;

  /// The memo type (none, id, text, hash, return).
  final String memoType;

  /// The memo value.
  final String? memoValue;

  /// The time bound minimum (Unix timestamp).
  final DateTime? timeBoundMin;

  /// The time bound maximum (Unix timestamp).
  final DateTime? timeBoundMax;

  /// The list of operations in the transaction.
  final List<PaymentOperation> operations;

  const Transaction({
    required this.sourceAccount,
    required this.sequenceNumber,
    this.fee = 100,
    this.memoType = 'none',
    this.memoValue,
    this.timeBoundMin,
    this.timeBoundMax,
    this.operations = const [],
  });

  Map<String, dynamic> toJson() => {
        'sourceAccount': sourceAccount,
        'sequenceNumber': sequenceNumber.toString(),
        'fee': fee,
        'memo': {
          'type': memoType,
          if (memoValue != null) 'value': memoValue,
        },
        'timeBounds': {
          if (timeBoundMin != null)
            'minTime': timeBoundMin!.millisecondsSinceEpoch ~/ 1000,
          if (timeBoundMax != null)
            'maxTime': timeBoundMax!.millisecondsSinceEpoch ~/ 1000,
        },
        'operations': operations.map((op) => op.toJson()).toList(),
      };

  /// Encodes this transaction as a Stellar XDR `TransactionV1` byte string.
  ///
  /// The resulting bytes represent a `TransactionEnvelope` with type
  /// discriminant `ENVELOPE_TYPE_TX` (2) and zero signatures, suitable for
  /// hashing and signing.  Wrap the bytes with [SignedTransaction.toXdrBase64]
  /// after adding a signature to obtain a base64-encoded envelope that can be
  /// submitted directly to Horizon's `/transactions` endpoint.
  ///
  /// XDR layout (Stellar-transaction.x `TransactionV1`):
  /// ```
  ///   [36]  sourceAccount (AccountID)
  ///   [4]   fee (Uint32)
  ///   [8]   seqNum (SequenceNumber = Int64)
  ///   [4]   cond type: 0=PRECOND_NONE, 1=PRECOND_TIME, 2=PRECOND_V2
  ///         + optional timeBounds
  ///   [4+…] memo (discriminant + value)
  ///   [4]   operations array length
  ///   […]   operations
  ///   [4]   ext = 0 (reserved)
  /// ```
  Uint8List toXdrBytes() {
    final w = _XdrWriter();

    // Source account.
    w.writeRaw(_encodeAccountId(sourceAccount));

    // Fee (Uint32).
    w.writeUint32(fee);

    // Sequence number (Int64).
    w.writeBigInt64(sequenceNumber);

    // Preconditions.
    _writePreconditions(w);

    // Memo.
    _writeMemo(w);

    // Operations.
    w.writeUint32(operations.length);
    for (final op in operations) {
      w.writeRaw(op.toXdrBytes());
    }

    // ext = 0 (no extension).
    w.writeUint32(0);

    return w.toBytes();
  }

  /// Returns the XDR-encoded transaction as a base64 string.
  ///
  /// This is the `tx` field expected by Horizon's
  /// `POST /transactions?tx=<base64>` endpoint (after wrapping in a
  /// `TransactionEnvelope`).
  String toXdrBase64() => base64.encode(toXdrBytes());

  void _writePreconditions(_XdrWriter w) {
    if (timeBoundMin == null && timeBoundMax == null) {
      // PRECOND_NONE = 0
      w.writeUint32(0);
      return;
    }

    // PRECOND_TIME = 1
    w.writeUint32(1);

    // TimeBounds { minTime, maxTime } (both Uint64)
    final minSecs =
        (timeBoundMin?.millisecondsSinceEpoch ?? 0) ~/ 1000;
    final maxSecs =
        (timeBoundMax?.millisecondsSinceEpoch ?? 0) ~/ 1000;
    w.writeUint64(minSecs);
    w.writeUint64(maxSecs);
  }

  void _writeMemo(_XdrWriter w) {
    switch (memoType) {
      case 'none':
        w.writeUint32(0); // MEMO_NONE
        break;
      case 'text':
        w.writeUint32(1); // MEMO_TEXT
        w.writeString(memoValue ?? '');
        break;
      case 'id':
        w.writeUint32(2); // MEMO_ID
        w.writeUint64(int.parse(memoValue ?? '0'));
        break;
      case 'hash':
        w.writeUint32(3); // MEMO_HASH
        w.writeOpaque(convert.hex.decode(memoValue ?? '0' * 64), 32);
        break;
      case 'return':
        w.writeUint32(4); // MEMO_RETURN
        w.writeOpaque(convert.hex.decode(memoValue ?? '0' * 64), 32);
        break;
      default:
        w.writeUint32(0); // Fallback: MEMO_NONE
    }
  }
}

/// Represents a signed transaction ready for submission.
@immutable
class SignedTransaction {
  /// The unsigned transaction.
  final Transaction transaction;

  /// The signature(s) as hex-encoded strings.
  final List<String> signatures;

  /// The public key(s) that signed the transaction.
  final List<String> signers;

  /// The hash of the transaction (used as the transaction ID).
  final String hash;

  const SignedTransaction({
    required this.transaction,
    required this.signatures,
    required this.signers,
    required this.hash,
  });

  Map<String, dynamic> toJson() => {
        'transaction': transaction.toJson(),
        'signatures': signatures,
        'signers': signers,
        'hash': hash,
      };

  /// Encodes this signed transaction as a Stellar XDR `TransactionEnvelope`
  /// and returns it as a base64 string suitable for submission to Horizon.
  ///
  /// Layout:
  /// ```
  ///   [4]  type discriminant: ENVELOPE_TYPE_TX = 2
  ///   [N]  TransactionV1 XDR bytes
  ///   [4]  signatures array length
  ///   per signature:
  ///     [4+4] DecoratedSignature.hint (first 4 bytes of the public key)
  ///     [4+64] DecoratedSignature.signature (variable-length opaque)
  /// ```
  String toXdrBase64() {
    final w = _XdrWriter();

    // Envelope type = ENVELOPE_TYPE_TX (2).
    w.writeUint32(2);

    // TransactionV1 body.
    w.writeRaw(transaction.toXdrBytes());

    // Signatures.
    w.writeUint32(signatures.length);
    for (var i = 0; i < signatures.length; i++) {
      final sigBytes = convert.hex.decode(signatures[i]);

      // Hint: first 4 bytes of the corresponding signer's public key.
      List<int> hint;
      if (i < signers.length && signers[i].isNotEmpty) {
        try {
          final decoded = StrKeyUtil.decodeBase32(signers[i]);
          hint = decoded.sublist(1, 5); // bytes 1–4 of decoded G-address
        } catch (_) {
          hint = [0, 0, 0, 0];
        }
      } else {
        hint = [0, 0, 0, 0];
      }
      w.writeOpaque(hint, 4);
      w.writeVarOpaque(sigBytes);
    }

    return base64.encode(w.toBytes());
  }
}
