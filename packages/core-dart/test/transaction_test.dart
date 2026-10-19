import 'dart:convert';
import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  group('TransactionBuilder', () {
    const validGAddress =
        'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
    const validDestination =
        'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';

    test('builds a valid transaction with required fields', () {
      final tx = TransactionBuilder()
          .setSourceAccount(validGAddress)
          .setSequenceNumber(BigInt.from(12345))
          .addPayment(
            destination: validDestination,
            amount: '100.50',
          )
          .build();

      expect(tx.sourceAccount, equals(validGAddress));
      expect(tx.sequenceNumber, equals(BigInt.from(12345)));
      expect(tx.fee, equals(100));
      expect(tx.memoType, equals('none'));
      expect(tx.operations.length, equals(1));
      expect(tx.operations[0].destination, equals(validDestination));
      expect(tx.operations[0].amount, equals('100.50'));
    });

    test('throws when source account is missing', () {
      expect(
        () => TransactionBuilder()
            .setSequenceNumber(BigInt.from(1))
            .addPayment(destination: validDestination, amount: '10')
            .build(),
        throwsA(isA<TransactionValidationException>()),
      );
    });

    test('throws when sequence number is missing', () {
      expect(
        () => TransactionBuilder()
            .setSourceAccount(validGAddress)
            .addPayment(destination: validDestination, amount: '10')
            .build(),
        throwsA(isA<TransactionValidationException>()),
      );
    });

    test('throws when no operations added', () {
      expect(
        () => TransactionBuilder()
            .setSourceAccount(validGAddress)
            .setSequenceNumber(BigInt.from(1))
            .build(),
        throwsA(isA<TransactionValidationException>()),
      );
    });

    test('accepts memo ID', () {
      final tx = TransactionBuilder()
          .setSourceAccount(validGAddress)
          .setSequenceNumber(BigInt.from(1))
          .setMemoId(BigInt.from(42))
          .addPayment(destination: validDestination, amount: '10')
          .build();

      expect(tx.memoType, equals('id'));
      expect(tx.memoValue, equals('42'));
    });

    test('accepts memo text', () {
      final tx = TransactionBuilder()
          .setSourceAccount(validGAddress)
          .setSequenceNumber(BigInt.from(1))
          .setMemoText('Hello')
          .addPayment(destination: validDestination, amount: '10')
          .build();

      expect(tx.memoType, equals('text'));
      expect(tx.memoValue, equals('Hello'));
    });

    test('accepts time bounds', () {
      final now = DateTime.now();
      final later = now.add(const Duration(hours: 1));
      final tx = TransactionBuilder()
          .setSourceAccount(validGAddress)
          .setSequenceNumber(BigInt.from(1))
          .setTimeBounds(minTime: now, maxTime: later)
          .addPayment(destination: validDestination, amount: '10')
          .build();

      expect(tx.timeBoundMin, equals(now));
      expect(tx.timeBoundMax, equals(later));
    });

    test('supports multiple operations', () {
      const dest2 = 'GDXJQBQN6X3CRN5X7LQZ5X7LQZ5X7LQZ5X7LQZ5X7LQZ5X7LQZ5X7LQZ5';
      final tx = TransactionBuilder()
          .setSourceAccount(validGAddress)
          .setSequenceNumber(BigInt.from(1))
          .addPayment(destination: validDestination, amount: '10')
          .addPayment(destination: dest2, amount: '20', asset: 'USDC')
          .build();

      expect(tx.operations.length, equals(2));
      expect(tx.operations[1].asset, equals('USDC'));
    });

    test('custom fee', () {
      final tx = TransactionBuilder()
          .setSourceAccount(validGAddress)
          .setSequenceNumber(BigInt.from(1))
          .setFee(500)
          .addPayment(destination: validDestination, amount: '10')
          .build();

      expect(tx.fee, equals(500));
    });

    test('throws for invalid destination', () {
      expect(
        () => TransactionBuilder()
            .setSourceAccount(validGAddress)
            .setSequenceNumber(BigInt.from(1))
            .addPayment(destination: 'invalid', amount: '10')
            .build(),
        throwsA(isA<TransactionValidationException>()),
      );
    });

    test('throws for negative amount', () {
      expect(
        () => TransactionBuilder()
            .setSourceAccount(validGAddress)
            .setSequenceNumber(BigInt.from(1))
            .addPayment(destination: validDestination, amount: '-10')
            .build(),
        throwsA(isA<TransactionValidationException>()),
      );
    });
  });

  group('validateTransaction', () {
    const validGAddress =
        'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
    const validDestination =
        'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';

    test('returns empty errors for valid transaction', () {
      final tx = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
        ],
      );

      final errors = validateTransaction(tx);
      expect(errors, isEmpty);
    });

    test('detects missing operations', () {
      final tx = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
      );

      final errors = validateTransaction(tx);
      expect(errors, isNotEmpty);
    });
  });

  group('signTransaction', () {
    test('creates signed transaction', () {
      const validGAddress =
          'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
      const validDestination =
          'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';

      final tx = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
        ],
      );

      final signed = signTransaction(
        tx,
        'GPublicKey123',
        'deadbeef',
        'txhash123',
      );

      expect(signed.signatures, contains('deadbeef'));
      expect(signed.signers, contains('GPublicKey123'));
      expect(signed.hash, equals('txhash123'));
    });
  });

  group('Transaction.toJson', () {
    test('produces correct JSON structure', () {
      const validGAddress =
          'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
      const validDestination =
          'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';

      final tx = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(123),
        fee: 200,
        memoType: 'id',
        memoValue: '42',
        timeBoundMin: DateTime.fromMillisecondsSinceEpoch(0),
        timeBoundMax: DateTime.fromMillisecondsSinceEpoch(1000000),
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '50'),
        ],
      );

      final json = tx.toJson();
      expect(json['sourceAccount'], equals(validGAddress));
      expect(json['sequenceNumber'], equals('123'));
      expect(json['fee'], equals(200));
      expect(json['memo']['type'], equals('id'));
      expect(json['memo']['value'], equals('42'));
      expect(json['operations'].length, equals(1));
    });
  });

  // -------------------------------------------------------------------------
  // Issue #321 — Real XDR serialization
  // -------------------------------------------------------------------------
  group('Transaction.toXdrBytes / toXdrBase64 (#321)', () {
    const validGAddress =
        'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
    const validDestination =
        'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';

    test('toXdrBytes returns non-empty Uint8List', () {
      final tx = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
        ],
      );
      final bytes = tx.toXdrBytes();
      expect(bytes, isNotEmpty);
    });

    test('toXdrBase64 returns a valid base64 string', () {
      final tx = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '100'),
        ],
      );
      final b64 = tx.toXdrBase64();
      // A valid base64 string can be decoded without errors.
      expect(() => base64.decode(b64), returnsNormally);
      expect(base64.decode(b64).length, greaterThan(0));
    });

    test('XDR output length grows with more operations', () {
      final tx1 = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
        ],
      );
      final tx2 = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '20'),
        ],
      );
      expect(tx2.toXdrBytes().length, greaterThan(tx1.toXdrBytes().length));
    });

    test('XDR bytes are deterministic for identical transactions', () {
      final tx1 = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(42),
        fee: 200,
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '50'),
        ],
      );
      final tx2 = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(42),
        fee: 200,
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '50'),
        ],
      );
      expect(tx1.toXdrBytes(), equals(tx2.toXdrBytes()));
    });

    test('different sequence numbers produce different XDR', () {
      final tx1 = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
        ],
      );
      final tx2 = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(2),
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
        ],
      );
      expect(tx1.toXdrBytes(), isNot(equals(tx2.toXdrBytes())));
    });

    test('memo-text transaction encodes memo field', () {
      final txNone = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        memoType: 'none',
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
        ],
      );
      final txText = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        memoType: 'text',
        memoValue: 'hello',
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
        ],
      );
      expect(txText.toXdrBytes().length, greaterThan(txNone.toXdrBytes().length));
    });

    test('time-bounds transaction encodes preconditions', () {
      final now = DateTime.fromMillisecondsSinceEpoch(0);
      final later = DateTime.fromMillisecondsSinceEpoch(1000000);
      final txNoBounds = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
        ],
      );
      final txBounds = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        timeBoundMin: now,
        timeBoundMax: later,
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
        ],
      );
      expect(
          txBounds.toXdrBytes().length,
          greaterThan(txNoBounds.toXdrBytes().length));
    });
  });

  // -------------------------------------------------------------------------
  // Issue #321 — SignedTransaction XDR envelope
  // -------------------------------------------------------------------------
  group('SignedTransaction.toXdrBase64 (#321)', () {
    const validGAddress =
        'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
    const validDestination =
        'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';

    test('returns a valid base64-encoded envelope', () {
      final tx = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
        ],
      );
      final signed = signTransaction(
        tx,
        validGAddress,
        'a' * 128, // 64-byte sig as hex (128 hex chars)
        'somehash',
      );
      final envelope = signed.toXdrBase64();
      expect(() => base64.decode(envelope), returnsNormally);
    });

    test('envelope is longer than raw tx bytes', () {
      final tx = Transaction(
        sourceAccount: validGAddress,
        sequenceNumber: BigInt.from(1),
        operations: [
          const PaymentOperation(
              destination: validDestination, asset: 'XLM', amount: '10'),
        ],
      );
      final signed = signTransaction(
        tx,
        validGAddress,
        'ab' * 64, // 64-byte sig as 128-char hex
        'somehash',
      );
      final txLen = tx.toXdrBytes().length;
      final envLen = base64.decode(signed.toXdrBase64()).length;
      // Envelope adds: 4 (type) + 4 (sigs array len) + 4 (hint) + 4+64 (sig) = 80 bytes
      expect(envLen, greaterThan(txLen));
    });
  });

  // -------------------------------------------------------------------------
  // Issue #319 — KeyPair.sign() method (end-to-end via builder)
  // -------------------------------------------------------------------------
  group('KeyPair.sign() (#319)', () {
    test('sign() returns a 64-byte SignatureResult', () {
      final seed = List<int>.generate(32, (i) => i);
      final keypair = KeyPair.fromSeed(seed);
      final message = [1, 2, 3, 4, 5];
      final result = keypair.sign(message);
      expect(result.signature.length, equals(64));
    });

    test('sign() result carries the correct public key', () {
      final seed = List<int>.generate(32, (i) => i + 7);
      final keypair = KeyPair.fromSeed(seed);
      final result = keypair.sign([42]);
      expect(result.publicKey, equals(keypair.publicKey));
    });

    test('sign() is deterministic for the same message and keypair', () {
      final seed = List<int>.generate(32, (i) => i);
      final keypair = KeyPair.fromSeed(seed);
      final msg = [9, 8, 7, 6, 5];
      expect(keypair.sign(msg).signature, equals(keypair.sign(msg).signature));
    });

    test('sign() result can be verified with verifyEd25519', () {
      final seed = List<int>.generate(32, (i) => i);
      final keypair = KeyPair.fromSeed(seed);
      final message = [10, 20, 30, 40, 50];

      final result = keypair.sign(message);
      final verification =
          verifyEd25519(message, result.signature, keypair.publicKey);
      expect(verification.isValid, isTrue);
    });

    test('different messages produce different signatures', () {
      final seed = List<int>.generate(32, (i) => i);
      final keypair = KeyPair.fromSeed(seed);
      expect(
        keypair.sign([1, 2, 3]).signature,
        isNot(equals(keypair.sign([4, 5, 6]).signature)),
      );
    });
  });
}
