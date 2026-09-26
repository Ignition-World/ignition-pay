import 'detect.dart';
import 'codes.dart';
import '../util/strkey.dart';

/// Supported blockchain networks for multi-chain address validation.
enum BlockchainNetwork {
  stellar,
  ethereum,
  bitcoin,
  solana,
  binanceSmartChain,
  polygon,
  avalanche,
  ripple,
  cardano,
  polkadot;

  /// Returns the display name of the blockchain.
  String get displayName {
    switch (this) {
      case stellar:
        return 'Stellar';
      case ethereum:
        return 'Ethereum';
      case bitcoin:
        return 'Bitcoin';
      case solana:
        return 'Solana';
      case binanceSmartChain:
        return 'Binance Smart Chain';
      case polygon:
        return 'Polygon';
      case avalanche:
        return 'Avalanche';
      case ripple:
        return 'Ripple';
      case cardano:
        return 'Cardano';
      case polkadot:
        return 'Polkadot';
    }
  }
}

/// The result of validating an address, with detailed error information.
class ValidationResult {
  /// Whether the address is valid.
  final bool isValid;

  /// The address kind if applicable (Stellar only).
  final AddressKind? kind;

  /// The blockchain network this address was validated against.
  final BlockchainNetwork network;

  /// A human-readable error message if validation failed.
  final String? errorMessage;

  /// A structured error code if validation failed.
  final String? errorCode;

  /// The original input that was validated.
  final String input;

  /// The normalized address (uppercase for Stellar).
  final String? normalizedAddress;

  /// Any warnings encountered during validation.
  final List<String> warnings;

  const ValidationResult({
    required this.isValid,
    this.kind,
    required this.network,
    this.errorMessage,
    this.errorCode,
    required this.input,
    this.normalizedAddress,
    this.warnings = const [],
  });

  @override
  String toString() {
    if (isValid) {
      final kindStr = kind != null ? ' (${kind!.name})' : '';
      return 'Valid $network address$kindStr';
    }
    return 'Invalid $network address: $errorMessage';
  }
}

/// Result of multi-chain validation.
class MultiChainValidationResult {
  /// Results for each network that was checked.
  final List<ValidationResult> results;

  /// Whether the address is valid on at least one network.
  bool get isValid => results.any((r) => r.isValid);

  /// The network(s) on which the address is valid.
  List<BlockchainNetwork> get validNetworks =>
      results.where((r) => r.isValid).map((r) => r.network).toList();

  const MultiChainValidationResult({required this.results});

  @override
  String toString() {
    if (isValid) {
      return 'Address valid on: ${validNetworks.map((n) => n.displayName).join(', ')}';
    }
    return 'Address invalid on all checked networks';
  }
}

/// Validates whether the given [address] is structurally valid on the Stellar network.
///
/// Returns a [ValidationResult] with detailed error information on failure.
/// Set [strict] to `true` to also check for canonical casing.
ValidationResult validateStellar(String address, {bool strict = false}) {
  if (address.isEmpty) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.stellar,
      errorMessage: 'Address cannot be empty',
      errorCode: 'EMPTY_ADDRESS',
      input: address,
    );
  }

  final prefix = address[0].toUpperCase();
  if (prefix != 'G' && prefix != 'M' && prefix != 'C') {
    final message = _getUnknownPrefixMessage(prefix, address);
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.stellar,
      errorMessage: message,
      errorCode: ErrorCode.unknownPrefix,
      input: address,
    );
  }

  // Reject the wrong length up front so truncated/padded input never
  // reaches Base32 decoding, instead of relying solely on the checksum.
  final expectedLength = prefix == 'M' ? 69 : 56;
  if (address.length != expectedLength) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.stellar,
      errorMessage:
          'Invalid address length: expected $expectedLength characters for a $prefix-address, got ${address.length}',
      errorCode: ErrorCode.invalidLength,
      input: address,
    );
  }

  final kind = detect(address);
  if (kind == null) {
    return _createInvalidStellarResult(address, prefix);
  }

  final warnings = <String>[];
  if (strict && address != address.toUpperCase()) {
    warnings.add('Address has non-canonical casing, normalized to uppercase');
  }

  return ValidationResult(
    isValid: true,
    kind: kind,
    network: BlockchainNetwork.stellar,
    input: address,
    normalizedAddress: address.toUpperCase(),
    warnings: warnings,
  );
}

String _getUnknownPrefixMessage(String prefix, String address) {
  switch (prefix) {
    case 'S':
      return 'Seed keys (starting with S) are not accepted as payment destinations';
    case 'T':
      return 'Pre-authorized transaction hashes (starting with T) are not accepted';
    case 'X':
      return 'HashX identifiers (starting with X) are not accepted';
    default:
      if (address.contains('*')) {
        return 'Federation addresses (name*domain.com) are not supported';
      }
      return 'Unknown address prefix "$prefix". Stellar addresses start with G, M, or C';
  }
}

ValidationResult _createInvalidStellarResult(String address, String prefix) {
  try {
    StrKeyUtil.decodeBase32(address);
  } catch (_) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.stellar,
      errorMessage: 'Address contains invalid Base32 characters',
      errorCode: ErrorCode.invalidBase32,
      input: address,
    );
  }

  final expectedLength = prefix == 'M' ? 43 : 35;
  return ValidationResult(
    isValid: false,
    network: BlockchainNetwork.stellar,
    errorMessage:
        'Invalid address: checksum or length mismatch (expected length $expectedLength for $prefix addresses)',
    errorCode: ErrorCode.invalidChecksum,
    input: address,
  );
}

/// Validates an Ethereum-style address (0x-prefixed hex, 40 hex chars).
ValidationResult validateEthereum(String address) {
  if (!address.startsWith('0x') || address.length != 42) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.ethereum,
      errorMessage:
          'Ethereum addresses must be 0x-prefixed and 42 characters long',
      errorCode: 'INVALID_ETHEREUM_LENGTH',
      input: address,
    );
  }

  final hex = address.substring(2);
  if (!RegExp(r'^[0-9a-fA-F]{40}$').hasMatch(hex)) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.ethereum,
      errorMessage: 'Ethereum address contains invalid hexadecimal characters',
      errorCode: 'INVALID_HEX',
      input: address,
    );
  }

  return ValidationResult(
    isValid: true,
    network: BlockchainNetwork.ethereum,
    input: address,
    normalizedAddress: address.toLowerCase(),
  );
}

/// Validates a Bitcoin address.
ValidationResult validateBitcoin(String address) {
  if (address.isEmpty) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.bitcoin,
      errorMessage: 'Bitcoin address cannot be empty',
      errorCode: 'EMPTY_ADDRESS',
      input: address,
    );
  }

  final prefix = address[0];
  final isP2PKH = prefix == '1';
  final isP2SH = prefix == '3';
  final isBech32 = address.startsWith('bc1');
  final isBech32Testnet = address.startsWith('tb1');

  if (!isP2PKH && !isP2SH && !isBech32 && !isBech32Testnet) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.bitcoin,
      errorMessage:
          'Bitcoin addresses must start with 1, 3, bc1, or tb1',
      errorCode: 'INVALID_BITCOIN_PREFIX',
      input: address,
    );
  }

  final validLength = (isBech32 || isBech32Testnet)
      ? (address.length >= 14 && address.length <= 74)
      : (address.length >= 26 && address.length <= 35);

  if (!validLength) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.bitcoin,
      errorMessage: 'Invalid Bitcoin address length',
      errorCode: 'INVALID_BITCOIN_LENGTH',
      input: address,
    );
  }

  return ValidationResult(
    isValid: true,
    network: BlockchainNetwork.bitcoin,
    input: address,
  );
}

/// Validates a Solana address (base58, 32-44 characters).
ValidationResult validateSolana(String address) {
  if (address.isEmpty) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.solana,
      errorMessage: 'Solana address cannot be empty',
      errorCode: 'EMPTY_ADDRESS',
      input: address,
    );
  }

  if (address.length < 32 || address.length > 44) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.solana,
      errorMessage: 'Solana addresses must be between 32 and 44 characters',
      errorCode: 'INVALID_SOLANA_LENGTH',
      input: address,
    );
  }

  if (!RegExp(r'^[1-9A-HJ-NP-Za-km-z]+$').hasMatch(address)) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.solana,
      errorMessage: 'Solana address contains invalid base58 characters',
      errorCode: 'INVALID_BASE58',
      input: address,
    );
  }

  return ValidationResult(
    isValid: true,
    network: BlockchainNetwork.solana,
    input: address,
  );
}

/// Determines the blockchain network from an address prefix and validates it.
ValidationResult validateBlockchainAddress(String address,
    {BlockchainNetwork? network}) {
  if (network != null) {
    switch (network) {
      case BlockchainNetwork.stellar:
        return validateStellar(address);
      case BlockchainNetwork.ethereum:
        return validateEthereum(address);
      case BlockchainNetwork.bitcoin:
        return validateBitcoin(address);
      case BlockchainNetwork.solana:
        return validateSolana(address);
      case BlockchainNetwork.binanceSmartChain:
        return validateEthereum(address);
      case BlockchainNetwork.polygon:
        return validateEthereum(address);
      case BlockchainNetwork.avalanche:
        return validateEthereum(address);
      case BlockchainNetwork.ripple:
        return _validateRipple(address);
      case BlockchainNetwork.cardano:
        return _validateCardano(address);
      case BlockchainNetwork.polkadot:
        return _validatePolkadot(address);
    }
  }

  return _autoDetectAndValidate(address);
}

ValidationResult _autoDetectAndValidate(String address) {
  if (address.isEmpty) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.stellar,
      errorMessage: 'Address cannot be empty',
      errorCode: 'EMPTY_ADDRESS',
      input: address,
    );
  }

  final upper = address.toUpperCase();
  if (upper.startsWith('G') || upper.startsWith('M') || upper.startsWith('C')) {
    return validateStellar(address);
  }

  if (address.startsWith('0x')) {
    return validateEthereum(address);
  }

  if (address.startsWith('1') || address.startsWith('3') ||
      address.startsWith('bc1') || address.startsWith('tb1')) {
    return validateBitcoin(address);
  }

  return ValidationResult(
    isValid: false,
    network: BlockchainNetwork.stellar,
    errorMessage:
        'Unable to determine blockchain network from address format',
    errorCode: 'UNKNOWN_NETWORK',
    input: address,
  );
}

ValidationResult _validateRipple(String address) {
  if (address.isEmpty) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.ripple,
      errorMessage: 'Ripple address cannot be empty',
      errorCode: 'EMPTY_ADDRESS',
      input: address,
    );
  }

  if (!address.startsWith('r')) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.ripple,
      errorMessage: 'Ripple addresses must start with r',
      errorCode: 'INVALID_RIPPLE_PREFIX',
      input: address,
    );
  }

  if (address.length < 25 || address.length > 35) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.ripple,
      errorMessage: 'Ripple addresses must be between 25 and 35 characters',
      errorCode: 'INVALID_RIPPLE_LENGTH',
      input: address,
    );
  }

  if (!RegExp(r'^r[1-9A-HJ-NP-Za-km-z]+$').hasMatch(address)) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.ripple,
      errorMessage: 'Ripple address contains invalid characters',
      errorCode: 'INVALID_RIPPLE_CHARS',
      input: address,
    );
  }

  return ValidationResult(
    isValid: true,
    network: BlockchainNetwork.ripple,
    input: address,
  );
}

ValidationResult _validateCardano(String address) {
  if (address.isEmpty) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.cardano,
      errorMessage: 'Cardano address cannot be empty',
      errorCode: 'EMPTY_ADDRESS',
      input: address,
    );
  }

  if (!address.startsWith('addr1') && !address.startsWith('stake1')) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.cardano,
      errorMessage: 'Cardano addresses must start with addr1 or stake1',
      errorCode: 'INVALID_CARDANO_PREFIX',
      input: address,
    );
  }

  if (address.length < 50 || address.length > 110) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.cardano,
      errorMessage: 'Invalid Cardano address length',
      errorCode: 'INVALID_CARDANO_LENGTH',
      input: address,
    );
  }

  return ValidationResult(
    isValid: true,
    network: BlockchainNetwork.cardano,
    input: address,
  );
}

ValidationResult _validatePolkadot(String address) {
  if (address.isEmpty) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.polkadot,
      errorMessage: 'Polkadot address cannot be empty',
      errorCode: 'EMPTY_ADDRESS',
      input: address,
    );
  }

  if (address.length < 32 || address.length > 48) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.polkadot,
      errorMessage: 'Polkadot addresses must be between 32 and 48 characters',
      errorCode: 'INVALID_POLKADOT_LENGTH',
      input: address,
    );
  }

  if (!RegExp(r'^[1-9A-HJ-NP-Za-km-z]+$').hasMatch(address)) {
    return ValidationResult(
      isValid: false,
      network: BlockchainNetwork.polkadot,
      errorMessage: 'Polkadot address contains invalid base58 characters',
      errorCode: 'INVALID_BASE58',
      input: address,
    );
  }

  return ValidationResult(
    isValid: true,
    network: BlockchainNetwork.polkadot,
    input: address,
  );
}

/// Validates an address across multiple blockchain networks.
///
/// [address] is the address string to validate.
/// [networks] is an optional list of networks to check against.
/// If null, checks against all supported networks.
MultiChainValidationResult validateMultiChain(String address,
    {List<BlockchainNetwork>? networks}) {
  final targets =
      networks ?? BlockchainNetwork.values;

  final results = targets.map((network) {
    return validateBlockchainAddress(address, network: network);
  }).toList();

  return MultiChainValidationResult(results: results);
}

/// Legacy simple validation function.
/// Returns true if the address is a structurally valid Stellar address.
bool validate(String address, {bool strict = false}) {
  final result = validateStellar(address, strict: strict);
  return result.isValid;
}

/// Validates a Stellar address and returns detailed result.
ValidationResult validateDetailed(String address, {bool strict = false}) {
  return validateStellar(address, strict: strict);
}
