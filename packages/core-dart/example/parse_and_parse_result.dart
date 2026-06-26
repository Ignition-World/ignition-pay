// Example: Address Parsing with Warnings and Error Handling
// Demonstrates the parse() function, ParseResult, warnings, and errors.

import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  // ---- 1. Successful Parsing ----
  void parseSuccess() {
    const address = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
    final result = parse(address);
    print('Kind: ${result.kind}'); // AddressKind.g
    print('Address: ${result.address}'); // (uppercase)
    print('Warnings: ${result.warnings}'); // []
    print('Error: ${result.error}'); // null
  }

  // ---- 2. Non-Canonical Casing Warning ----
  void parseLowercase() {
    const lowercase = 'gaazi4tcr3ty5ojhctjc2a4qsy6cjwjh5iajtgkin2er7lbnvkoccwn';
    final result = parse(lowercase);
    print('Kind: ${result.kind}'); // AddressKind.g
    print('Address: ${result.address}'); // (uppercase)
    for (final w in result.warnings) {
      print('Warning: [${w.severity}] ${w.code}: ${w.message}');
      if (w.normalization != null) {
        print('  Original: ${w.normalization!.original}');
        print('  Normalized: ${w.normalization!.normalized}');
      }
    }
  }

  // ---- 3. Invalid Address Error ----
  void parseInvalid() {
    const invalid = 'NOTANADDRESS';
    final result = parse(invalid);
    print('Kind: ${result.kind}'); // null
    print('Error: ${result.error?.code}'); // UNKNOWN_PREFIX
    print('Error message: ${result.error?.message}'); // Invalid address
    print('Error input: ${result.error?.input}'); // NOTANADDRESS
  }

  // ---- 4. Using ParseResult in Application Logic ----
  void parseUsage() {
    const userInput = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
    final result = parse(userInput);

    if (result.error != null) {
      print('Failed: ${result.error!.message}');
      return;
    }

    switch (result.kind) {
      case AddressKind.g:
        print('Classic address detected: ${result.address}');
        break;
      case AddressKind.m:
        print('Muxed address detected: ${result.address}');
        break;
      case AddressKind.c:
        print('Contract address — not valid for payments');
        break;
      case null:
        print('Unknown address type');
    }

    for (final warning in result.warnings) {
      print('⚠️ ${warning.code}: ${warning.message}');
    }
  }

  parseSuccess();
  parseLowercase();
  parseInvalid();
  parseUsage();
}
