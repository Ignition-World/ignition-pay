import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/widgets/copyable_address.dart';
import 'address_scan_payload.dart';
import 'address_scanner.dart';
import 'data/draft_store.dart';
import 'data/transaction_draft.dart';

class PaymentReviewPage extends StatefulWidget {
  const PaymentReviewPage({
    super.key,
    required this.initialAddress,
    required this.initialAmount,
    required this.initialAsset,
    this.initialMemo,
    this.draftStore,
    this.draftIdGenerator,
    this.scanPaymentData,
  });

  final String initialAddress;
  final String? initialAmount;
  final String initialAsset;
  final String? initialMemo;

  /// When provided, an abandoned, incomplete form is persisted here so it can
  /// be auto-submitted once connectivity returns (issue #678).
  final DraftStore? draftStore;

  /// Generates ids for persisted drafts; overridable for deterministic tests.
  final String Function()? draftIdGenerator;

  /// Test seam for the QR scanner. When omitted the real
  /// [AddressScannerPage] is pushed.
  final Future<ScannedPaymentData?> Function(BuildContext context)?
      scanPaymentData;

  @override
  State<PaymentReviewPage> createState() => _PaymentReviewPageState();
}

class _PaymentReviewPageState extends State<PaymentReviewPage> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _addressController;
  late final TextEditingController _amountController;
  late final TextEditingController _assetController;
  late final TextEditingController _memoController;

  /// Estimated network fee recorded on persisted drafts.
  static const String _defaultFeeEstimate = '0.00001 XLM';

  @override
  void initState() {
    super.initState();
    _addressController = TextEditingController(text: widget.initialAddress);
    _amountController = TextEditingController(text: widget.initialAmount ?? '');
    _assetController = TextEditingController(text: widget.initialAsset);
    _memoController = TextEditingController(text: widget.initialMemo ?? '');
  }

  @override
  void dispose() {
    _saveDraftIfNeeded();
    _addressController.dispose();
    _amountController.dispose();
    _assetController.dispose();
    _memoController.dispose();
    super.dispose();
  }

  String? _validateAddress(String? value) {
    final address = value?.trim() ?? '';
    if (!RegExp(r'^G[A-Z2-7]{55}$').hasMatch(address)) {
      return 'Enter a valid Stellar address';
    }
    return null;
  }

  String? _validateAmount(String? value) {
    final input = value?.trim() ?? '';
    final amount = double.tryParse(input);
    if (amount == null || amount <= 0) return 'Enter a positive amount';
    if (input.contains('.') && input.split('.').last.length > 7) {
      return 'Amount supports up to 7 decimal places';
    }
    return null;
  }

  /// True when the user has entered something but the form is not yet valid.
  bool get _isIncomplete {
    final hasInput = _addressController.text.trim().isNotEmpty ||
        _amountController.text.trim().isNotEmpty ||
        _memoController.text.trim().isNotEmpty;
    if (!hasInput) return false;

    final valid = _validateAddress(_addressController.text) == null &&
        _validateAmount(_amountController.text) == null;
    return !valid;
  }

  /// Persists the in-progress form as an offline draft, if applicable.
  void _saveDraftIfNeeded() {
    final store = widget.draftStore;
    if (store == null || !_isIncomplete) return;

    final memo = _memoController.text.trim();
    final asset = _assetController.text.trim();
    final draft = TransactionDraft(
      id: (widget.draftIdGenerator ?? _defaultDraftId)(),
      recipient: _addressController.text.trim(),
      amount: _amountController.text.trim(),
      asset: asset.isEmpty ? 'XLM' : asset,
      memo: memo.isEmpty ? null : memo,
      feeEstimate: _defaultFeeEstimate,
      createdAt: DateTime.now(),
    );
    unawaited(store.save(draft));
  }

  static String _defaultDraftId() =>
      'draft_${DateTime.now().microsecondsSinceEpoch}';

  void _applyScannedPayment(ScannedPaymentData data) {
    setState(() {
      _addressController.text = data.address;
      if (data.amount != null && data.amount!.isNotEmpty) {
        _amountController.text = data.amount!;
      }
      if (data.asset != null && data.asset!.isNotEmpty) {
        _assetController.text = data.asset!;
      }
      if (data.memo != null && data.memo!.isNotEmpty) {
        _memoController.text = data.memo!;
      }
    });
  }

  void _reviewAndSend() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Payment ready to send')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Review payment')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            CopyableAddress(address: _addressController.text),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextFormField(
                    key: const Key('recipient_field'),
                    controller: _addressController,
                    decoration:
                        const InputDecoration(labelText: 'Recipient address'),
                    validator: _validateAddress,
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(width: 8),
                ScanAddressButton(
                  onScanned: _applyScannedPayment,
                  openScanner: widget.scanPaymentData,
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('amount_field'),
              controller: _amountController,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Amount'),
              validator: _validateAmount,
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('asset_field'),
              controller: _assetController,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'Asset'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('memo_field'),
              controller: _memoController,
              decoration: const InputDecoration(labelText: 'Memo (optional)'),
              maxLength: 28,
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _reviewAndSend,
              child: const Text('Review and send'),
            ),
          ],
        ),
      ),
    );
  }
}
