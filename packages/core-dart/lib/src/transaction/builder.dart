import 'dart:convert';
import '../address/detect.dart';
import '../address/codes.dart';
import 'transaction.dart';

/// Exception thrown when transaction validation fails.
class TransactionValidationException implements Exception {
  final String message;
  final List<String> errors;

  const TransactionValidationException(this.message, {this.errors = const []});

  @override
  String toString() {
    if (errors.isEmpty) return 'TransactionValidationException: $message';
    return 'TransactionValidationException: $message\n  ${errors.join('\n  ')}';
  }
}

/// Builder for constructing Stellar transactions.
///
/// Uses the builder pattern to create [Transaction] objects with
/// validation at each step.
class TransactionBuilder {
  static const int _defaultBaseFee = 100;
  static int _networkBaseFee = _defaultBaseFee;
  
  String? _sourceAccount;
  BigInt? _sequenceNumber;
  int _fee = _defaultBaseFee;
  String _memoType = 'none';
  String? _memoValue;
  DateTime? _timeBoundMin;
  DateTime? _timeBoundMax;
  final List<PaymentOperation> _operations = [];
  final List<String> _errors = [];
  
  /// Updates the network base fee used for minimum fee validation.
  /// This should be called with the current network fee fetched from the Stellar network.
  static void setNetworkBaseFee(int fee) {
    if (fee < _defaultBaseFee) {
      _networkBaseFee = _defaultBaseFee;
    } else {
      _networkBaseFee = fee;
    }
  }
  
  /// Gets the current network base fee used for minimum fee validation.
  static int getNetworkBaseFee() => _networkBaseFee;
  
  /// Resets the network base fee to the default 100 stroops.
  static void resetNetworkBaseFee() {
    _networkBaseFee = _defaultBaseFee;
  }

  /// Sets the source account for the transaction.
  /// Must be a valid Stellar G or M address.
  TransactionBuilder setSourceAccount(String account) {
    _validateSourceAccount(account);
    _sourceAccount = account.toUpperCase();
    return this;
  }

  /// Sets the sequence number for the transaction.
  TransactionBuilder setSequenceNumber(BigInt sequenceNumber) {
    if (sequenceNumber < BigInt.zero) {
      _errors.add('Sequence number cannot be negative');
    }
    _sequenceNumber = sequenceNumber;
    return this;
  }

  /// Sets the fee for the transaction in stroops.
  /// Must be at least the current network base fee.
  TransactionBuilder setFee([int? fee]) {
    final finalFee = fee ?? _defaultBaseFee;
    if (finalFee < _networkBaseFee) {
      _errors.add('Fee must be at least $_networkBaseFee stroops (current network base fee)');
    }
    _fee = finalFee;
    return this;
  }

  /// Sets a memo ID for the transaction.
  TransactionBuilder setMemoId(BigInt id) {
    if (id < BigInt.zero) {
      _errors.add('Memo ID cannot be negative');
    }
    _memoType = 'id';
    _memoValue = id.toString();
    return this;
  }

  /// Sets a text memo for the transaction.
  TransactionBuilder setMemoText(String text) {
    if (text.isEmpty) {
      _errors.add('Memo text cannot be empty');
    }
    final byteLength = utf8.encode(text).length;
    if (byteLength > 28) {
      _errors.add('Memo text must be 28 bytes or less');
    }
    _memoType = 'text';
    _memoValue = text;
    return this;
  }

  /// Sets a hash memo (hex-encoded 32-byte hash).
  TransactionBuilder setMemoHash(String hash) {
    if (hash.length != 64) {
      _errors.add('Memo hash must be a 64-character hex string (32 bytes)');
    }
    _memoType = 'hash';
    _memoValue = hash;
    return this;
  }

  /// Clears the memo.
  TransactionBuilder clearMemo() {
    _memoType = 'none';
    _memoValue = null;
    return this;
  }

  /// Sets the time bounds for the transaction.
  TransactionBuilder setTimeBounds({
    DateTime? minTime,
    DateTime? maxTime,
  }) {
    if (minTime != null && maxTime != null && minTime.isAfter(maxTime)) {
      _errors.add('minTime must be before maxTime');
    }
    _timeBoundMin = minTime;
    _timeBoundMax = maxTime;
    return this;
  }

  /// Adds a payment operation to the transaction.
  TransactionBuilder addPayment({
    required String destination,
    required String amount,
    String asset = 'XLM',
  }) {
    _validateDestination(destination);
    _validateAmount(amount);
    _operations.add(PaymentOperation(
      destination: destination.toUpperCase(),
      asset: asset,
      amount: amount,
    ));
    return this;
  }

  /// Builds and validates the transaction.
  ///
  /// Throws [TransactionValidationException] if validation fails.
  Transaction build() {
    _validateRequired();

    if (_errors.isNotEmpty) {
      throw TransactionValidationException(
        'Transaction validation failed',
        errors: List.unmodifiable(_errors),
      );
    }

    return Transaction(
      sourceAccount: _sourceAccount!,
      sequenceNumber: _sequenceNumber!,
      fee: _fee,
      memoType: _memoType,
      memoValue: _memoValue,
      timeBoundMin: _timeBoundMin,
      timeBoundMax: _timeBoundMax,
      operations: List.unmodifiable(_operations),
    );
  }

  void _validateSourceAccount(String account) {
    if (account.isEmpty) {
      _errors.add('Source account cannot be empty');
      return;
    }
    final kind = detect(account);
    if (kind == null || kind == AddressKind.c) {
      _errors.add('Invalid source account: must be a valid G or M address');
    }
  }

  void _validateDestination(String destination) {
    if (destination.isEmpty) {
      _errors.add('Destination cannot be empty');
      return;
    }
    final kind = detect(destination);
    if (kind == null) {
      _errors.add('Invalid destination: must be a valid Stellar address');
    }
  }

  void _validateAmount(String amount) {
    if (amount.isEmpty) {
      _errors.add('Amount cannot be empty');
      return;
    }
    final parsed = num.tryParse(amount);
    if (parsed == null || parsed <= 0) {
      _errors.add('Amount must be a positive number');
    }
  }

  void _validateRequired() {
    if (_sourceAccount == null) {
      _errors.add('Source account is required');
    }
    if (_sequenceNumber == null) {
      _errors.add('Sequence number is required');
    }
    if (_operations.isEmpty) {
      _errors.add('At least one operation is required');
    }
  }
}

/// Signs a transaction with the given key material.
///
/// This is a wrapper that prepares the transaction for signing.
/// The actual cryptographic signing is handled by the crypto utilities.
SignedTransaction signTransaction(
  Transaction transaction,
  String publicKey,
  String signatureHex,
  String transactionHash,
) {
  if (publicKey.isEmpty) {
    throw const TransactionValidationException('Public key cannot be empty');
  }
  if (signatureHex.isEmpty) {
    throw const TransactionValidationException('Signature cannot be empty');
  }

  return SignedTransaction(
    transaction: transaction,
    signatures: [signatureHex],
    signers: [publicKey],
    hash: transactionHash,
  );
}

/// Validates a transaction before submission.
///
/// Returns a list of validation error messages (empty if valid).
List<String> validateTransaction(Transaction transaction) {
  final errors = <String>[];

  final sourceDetect = detect(transaction.sourceAccount);
  if (sourceDetect == null) {
    errors.add('Invalid source account: ${transaction.sourceAccount}');
  }

  if (transaction.sequenceNumber < BigInt.zero) {
    errors.add('Invalid sequence number: ${transaction.sequenceNumber}');
  }

  if (transaction.fee < TransactionBuilder.getNetworkBaseFee()) {
    errors.add('Fee must be at least ${TransactionBuilder.getNetworkBaseFee()} stroops');
  }

  if (transaction.operations.isEmpty) {
    errors.add('Transaction must have at least one operation');
  }

  for (var i = 0; i < transaction.operations.length; i++) {
    final op = transaction.operations[i];
    final destDetect = detect(op.destination);
    if (destDetect == null) {
      errors.add('Operation $i: invalid destination ${op.destination}');
    }
    final amount = num.tryParse(op.amount);
    if (amount == null || amount <= 0) {
      errors.add('Operation $i: invalid amount "${op.amount}"');
    }
  }

  if (transaction.timeBoundMin != null &&
      transaction.timeBoundMax != null &&
      transaction.timeBoundMin!.isAfter(transaction.timeBoundMax!)) {
    errors.add('minTime must be before maxTime');
  }

  return errors;
}