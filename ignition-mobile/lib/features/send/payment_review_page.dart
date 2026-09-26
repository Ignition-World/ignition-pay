import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/widgets/copyable_address.dart';
import 'address_scan_payload.dart';
import 'address_scanner.dart';
import 'data/draft_store.dart';
import 'data/fee_estimate.dart';
import 'data/transaction_draft.dart';
import 'fee_disclosure.dart';
import 'send_confirmation_sheet.dart';
import 'services/fee_estimation_service.dart';

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
    this.feeEstimationService,
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

  /// Service used to fetch fee estimates from the API with 60s cache.
  final FeeEstimationDataSource? feeEstimationService;

  @override
  State<PaymentReviewPage> createState() => _PaymentReviewPageState();
}

class _PaymentReviewPageState extends State<PaymentReviewPage> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _addressController;
  late final TextEditingController _amountController;
  late final TextEditingController _assetController;
  late final TextEditingController _memoController;

  late final FeeEstimationDataSource _feeService;

  FeeEstimate? _feeEstimate;
  bool _isLoadingFee = false;
  String? _feeError;
  Timer? _debounceTimer;

  /// Default fallback network fee recorded on persisted drafts.
  static const String _defaultFeeEstimate = '0.00001 XLM';

  @override
  void initState() {
    super.initState();
    _addressController = TextEditingController(text: widget.initialAddress);
    _amountController = TextEditingController(text: widget.initialAmount ?? '');
    _assetController = TextEditingController(text: widget.initialAsset);
    _memoController = TextEditingController(text: widget.initialMemo ?? '');

    _feeService = widget.feeEstimationService ?? FeeEstimationService();

    _fetchFeeEstimate();
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _saveDraftIfNeeded();
    _addressController.dispose();
    _amountController.dispose();
    _assetController.dispose();
    _memoController.dispose();
    super.dispose();
  }

  void _onAssetOrAmountChanged() {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 400), () {
      if (mounted) {
        _fetchFeeEstimate();
      }
    });
  }

  Future<void> _fetchFeeEstimate({bool forceRefresh = false}) async {
    final asset = _assetController.text.trim();
    final effectiveAsset = asset.isEmpty ? 'XLM' : asset;
    final amount = _amountController.text.trim();
    final recipient = _addressController.text.trim();

    setState(() {
      _isLoadingFee = true;
      _feeError = null;
    });

    try {
      final estimate = await _feeService.estimateFee(
        assetCode: effectiveAsset,
        amount: amount.isNotEmpty ? amount : null,
        recipient: recipient.isNotEmpty ? recipient : null,
        forceRefresh: forceRefresh,
      );

      if (!mounted) return;
      setState(() {
        _feeEstimate = estimate;
        _isLoadingFee = false;
        _feeError = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoadingFee = false;
        _feeError = 'Failed to estimate network fee. Tap to retry.';
      });
    }
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
    final feeEst = _feeEstimate != null
        ? '${_feeEstimate!.feeAmount} ${_feeEstimate!.assetCode}'
        : _defaultFeeEstimate;

    final draft = TransactionDraft(
      id: (widget.draftIdGenerator ?? _defaultDraftId)(),
      recipient: _addressController.text.trim(),
      amount: _amountController.text.trim(),
      asset: asset.isEmpty ? 'XLM' : asset,
      memo: memo.isEmpty ? null : memo,
      feeEstimate: feeEst,
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
    _fetchFeeEstimate();
  }

  void _reviewAndSend() {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final recipient = _addressController.text.trim();
    final amount = _amountController.text.trim();
    final asset = _assetController.text.trim().isEmpty
        ? 'XLM'
        : _assetController.text.trim();
    final memo = _memoController.text.trim();
    final fee = _feeEstimate != null
        ? '${_feeEstimate!.feeAmount} ${_feeEstimate!.assetCode}'
        : _defaultFeeEstimate;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SendConfirmationSheet(
        recipient: recipient,
        amount: amount,
        asset: asset,
        fee: fee,
        memo: memo.isEmpty ? null : memo,
        onConfirm: () {
          Navigator.of(ctx).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Payment sent successfully')),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final asset = _assetController.text.trim();
    final effectiveAsset = asset.isEmpty ? 'XLM' : asset;

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
                    onChanged: (_) {
                      setState(() {});
                      _onAssetOrAmountChanged();
                    },
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
              onChanged: (_) => _onAssetOrAmountChanged(),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('asset_field'),
              controller: _assetController,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'Asset'),
              onChanged: (_) => _onAssetOrAmountChanged(),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('memo_field'),
              controller: _memoController,
              decoration: const InputDecoration(labelText: 'Memo (optional)'),
              maxLength: 28,
            ),
            const SizedBox(height: 8),
            // Fee estimation step displayed before the confirmation sheet
            FeeDisclosure(
              key: const Key('fee_disclosure_section'),
              feeEstimate: _feeEstimate,
              assetCode: effectiveAsset,
              isLoading: _isLoadingFee,
              errorMessage: _feeError,
              onRetry: () => _fetchFeeEstimate(forceRefresh: true),
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
