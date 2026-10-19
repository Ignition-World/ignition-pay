import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'address_scan_payload.dart';

/// Signature for the live camera preview, injectable so widget tests can
/// exercise the surrounding flow without a camera.
typedef ScannerViewBuilder = Widget Function(
  BuildContext context,
  void Function(BarcodeCapture capture) onDetect,
);

/// Full-screen QR scanner that resolves a Stellar payment payload and pops it
/// back to the caller. Returns `null` when the user cancels.
class AddressScannerPage extends StatefulWidget {
  const AddressScannerPage({
    super.key,
    this.controller,
    this.scannerViewBuilder,
  });

  /// Optional controller; one is created (and disposed) when omitted.
  final MobileScannerController? controller;

  /// Optional camera-preview builder. Defaults to a [MobileScanner] widget.
  final ScannerViewBuilder? scannerViewBuilder;

  @override
  State<AddressScannerPage> createState() => _AddressScannerPageState();
}

class _AddressScannerPageState extends State<AddressScannerPage> {
  // Created lazily so tests that inject a [scannerViewBuilder] never touch the
  // camera platform channel.
  MobileScannerController? _controller;
  bool _handled = false;
  String? _message;

  MobileScannerController get _scannerController =>
      _controller ??= widget.controller ?? MobileScannerController();

  @override
  void dispose() {
    if (widget.controller == null) {
      // Only dispose a controller this page created.
      _controller?.dispose();
    }
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;

    for (final barcode in capture.barcodes) {
      final rawValue = barcode.rawValue;
      if (rawValue == null) continue;

      final parsed = AddressScanParser.parse(rawValue);
      if (parsed != null) {
        _handled = true;
        Navigator.of(context).pop(parsed);
        return;
      }
    }

    if (mounted) {
      setState(() => _message = 'That QR code is not a valid payment request.');
    }
  }

  Widget _errorBuilder(BuildContext context, MobileScannerException error) {
    final permissionDenied =
        error.errorCode == MobileScannerErrorCode.permissionDenied;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.no_photography_outlined, size: 48),
            const SizedBox(height: 12),
            Text(
              permissionDenied
                  ? 'Camera access is needed to scan payment QR codes. '
                      'Enable it in your device settings and try again.'
                  : 'The camera could not be started.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              key: const Key('scanner_retry_button'),
              onPressed: () => _scannerController.start(),
              child: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final builder = widget.scannerViewBuilder;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan QR code'),
        leading: IconButton(
          key: const Key('scanner_close_button'),
          icon: const Icon(Icons.close),
          tooltip: 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Stack(
        children: [
          Positioned.fill(
            child: builder != null
                ? builder(context, _onDetect)
                : MobileScanner(
                    controller: _scannerController,
                    onDetect: _onDetect,
                    errorBuilder: _errorBuilder,
                  ),
          ),
          if (_message != null)
            Positioned(
              left: 16,
              right: 16,
              bottom: 24,
              child: Material(
                color: Theme.of(context).colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    _message!,
                    key: const Key('scanner_message'),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Button that opens [AddressScannerPage] and reports the scanned payload.
class ScanAddressButton extends StatelessWidget {
  const ScanAddressButton({
    super.key,
    required this.onScanned,
    this.openScanner,
    this.label = 'Scan QR code',
  });

  /// Invoked with the parsed payload once a code is recognised.
  final ValueChanged<ScannedPaymentData> onScanned;

  /// Overrides how the scanner is opened; injectable for widget tests.
  final Future<ScannedPaymentData?> Function(BuildContext context)?
      openScanner;

  final String label;

  Future<ScannedPaymentData?> _open(BuildContext context) {
    final override = openScanner;
    if (override != null) return override(context);
    return Navigator.of(context).push<ScannedPaymentData>(
      MaterialPageRoute<ScannedPaymentData>(
        builder: (_) => const AddressScannerPage(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      key: const Key('scan_address_button'),
      onPressed: () async {
        final result = await _open(context);
        if (result != null) onScanned(result);
      },
      icon: const Icon(Icons.qr_code_scanner, size: 18),
      label: Text(label),
    );
  }
}
