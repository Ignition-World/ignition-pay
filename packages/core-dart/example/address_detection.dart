// Example: Address Detection and Validation
// Demonstrates detecting and validating G, M, and C Stellar addresses.

import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  // ---- Classic G Address ----
  const gAddress = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
  final gKind = detect(gAddress);
  final gValid = validate(gAddress);
  print('G Address: kind=$gKind, valid=$gValid');

  // ---- Muxed M Address ----
  const mAddress =
      'MA7QYNF7SOWQ3GLR2BGMZEHXR7HGCLSQSKMFYZ8ITCOMBKS5HVJBCAQV4JDPROD7DAQ';
  final mKind = detect(mAddress);
  final mValid = validate(mAddress);
  print('M Address: kind=$mKind, valid=$mValid');

  // ---- Contract C Address ----
  const cAddress =
      'CA7QYNF7SOWQ3GLR2BGMZEHXR7HGCLSQSKMFYZ8ITCOMBKS5HVJBAQLCD';
  final cKind = detect(cAddress);
  final cValid = validate(cAddress);
  print('C Address: kind=$cKind, valid=$cValid');

  // ---- Invalid Addresses ----
  const emptyAddress = '';
  print('Empty: ${detect(emptyAddress)}'); // null

  const unknownPrefix = 'NOTANADDRESS';
  print('Unknown prefix: ${detect(unknownPrefix)}'); // null

  const tamperedChecksum =
      'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWX';
  print('Tampered checksum: ${detect(tamperedChecksum)}'); // null

  // ---- Lowercase Detection (case-insensitive) ----
  const lowercaseG = 'gaazi4tcr3ty5ojhctjc2a4qsy6cjwjh5iajtgkin2er7lbnvkoccwn';
  print('Lowercase G: ${detect(lowercaseG)}'); // AddressKind.g

  // ---- Strict Validation ----
  final strictResult = validate(lowercaseG, strict: true);
  print('Strict lowercase: $strictResult'); // false (non-canonical casing)
}
