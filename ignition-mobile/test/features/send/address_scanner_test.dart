import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'package:ignition_mobile/features/send/address_scan_payload.dart';
import 'package:ignition_mobile/features/send/address_scanner.dart';
import 'package:ignition_mobile/features/send/payment_review_page.dart';

void main() {
  final account = 'G${'A' * 55}';

  String fieldText(WidgetTester tester, Key key) {
    final editable = find.descendant(
      of: find.byKey(key),
      matching: find.byType(EditableText),
    );
    return tester.widget<EditableText>(editable).controller.text;
  }

  /// Pumps a host page with a button that pushes [AddressScannerPage] and
  /// captures its result.
  Future<void Function(BarcodeCapture)> openScanner(
    WidgetTester tester, {
    required void Function(ScannedPaymentData?) onResult,
  }) async {
    late void Function(BarcodeCapture) detect;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () async {
                  final result = await Navigator.of(context)
                      .push<ScannedPaymentData>(
                    MaterialPageRoute<ScannedPaymentData>(
                      builder: (_) => AddressScannerPage(
                        scannerViewBuilder: (context, onDetect) {
                          detect = onDetect;
                          return const ColoredBox(color: Colors.black);
                        },
                      ),
                    ),
                  );
                  onResult(result);
                },
                child: const Text('open scanner'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('open scanner'));
    await tester.pumpAndSettle();
    return detect;
  }

  testWidgets('a recognised deep-link code pops the parsed payload',
      (tester) async {
    ScannedPaymentData? result;
    final detect = await openScanner(tester, onResult: (value) => result = value);

    detect(
      BarcodeCapture(
        barcodes: <Barcode>[
          Barcode(
            rawValue: 'ignitionpay://pay/$account?amount=10&asset=USDC&memo=hi',
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();

    expect(result, isNotNull);
    final parsed = result!;
    expect(parsed.address, account);
    expect(parsed.amount, '10');
    expect(parsed.asset, 'USDC');
    expect(parsed.memo, 'hi');
  });

  testWidgets('a plain address code is recognised', (tester) async {
    ScannedPaymentData? result;
    final detect = await openScanner(tester, onResult: (value) => result = value);

    detect(BarcodeCapture(barcodes: <Barcode>[Barcode(rawValue: account)]));
    await tester.pumpAndSettle();

    expect(result?.address, account);
  });

  testWidgets('an unrecognised code surfaces a message and keeps scanning',
      (tester) async {
    ScannedPaymentData? result;
    final detect = await openScanner(tester, onResult: (value) => result = value);

    detect(
      const BarcodeCapture(
        barcodes: <Barcode>[
          Barcode(rawValue: 'https://example.com/nope'),
        ],
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('scanner_message')), findsOneWidget);
    expect(result, isNull);

    detect(BarcodeCapture(barcodes: <Barcode>[Barcode(rawValue: account)]));
    await tester.pumpAndSettle();
    expect(result?.address, account);
  });

  testWidgets('the cancel button returns to the caller with no result',
      (tester) async {
    ScannedPaymentData? result;
    var completed = false;
    await openScanner(tester, onResult: (value) {
      result = value;
      completed = true;
    });

    await tester.tap(find.byKey(const Key('scanner_close_button')));
    await tester.pumpAndSettle();

    expect(completed, isTrue);
    expect(result, isNull);
  });

  testWidgets('ScanAddressButton forwards an injected scan result',
      (tester) async {
    ScannedPaymentData? received;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ScanAddressButton(
            openScanner: (_) async => ScannedPaymentData(
              address: account,
              amount: '5',
              asset: 'XLM',
            ),
            onScanned: (data) => received = data,
          ),
        ),
      ),
    );

    await tester.tap(find.byKey(const Key('scan_address_button')));
    await tester.pumpAndSettle();

    expect(received?.address, account);
    expect(received?.amount, '5');
  });

  testWidgets('scanning pre-fills the send form', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: PaymentReviewPage(
          initialAddress: '',
          initialAmount: null,
          initialAsset: 'XLM',
          scanPaymentData: (_) async => ScannedPaymentData(
            address: account,
            amount: '12',
            asset: 'USDC',
            memo: 'scan',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('scan_address_button')));
    await tester.pumpAndSettle();

    expect(fieldText(tester, const Key('recipient_field')), account);
    expect(fieldText(tester, const Key('amount_field')), '12');
    expect(fieldText(tester, const Key('asset_field')), 'USDC');
    expect(fieldText(tester, const Key('memo_field')), 'scan');
  });
}
