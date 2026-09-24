import 'package:flutter/material.dart';

import '../../core/widgets/copyable_address.dart';

class PaymentReviewPage extends StatefulWidget {
  const PaymentReviewPage({
    super.key,
    required this.initialAddress,
    required this.initialAmount,
    required this.initialAsset,
    this.initialMemo,
  });

  final String initialAddress;
  final String? initialAmount;
  final String initialAsset;
  final String? initialMemo;

  @override
  State<PaymentReviewPage> createState() => _PaymentReviewPageState();
}

class _PaymentReviewPageState extends State<PaymentReviewPage> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _addressController;
  late final TextEditingController _amountController;
  late final TextEditingController _assetController;
  late final TextEditingController _memoController;

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
            TextFormField(
              controller: _addressController,
              decoration: const InputDecoration(labelText: 'Recipient address'),
              validator: _validateAddress,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Amount'),
              validator: _validateAmount,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _assetController,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'Asset'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _memoController,
              decoration: const InputDecoration(labelText: 'Memo (optional)'),
              maxLength: 28,
            ),
            const SizedBox(height: 20),
            FilledButton(onPressed: _reviewAndSend, child: const Text('Review and send')),
          ],
        ),
      ),
    );
  }
}
