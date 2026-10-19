import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class CopyableAddress extends StatelessWidget {
  const CopyableAddress({super.key, required this.address, this.textAlign = TextAlign.start});

  final String address;
  final TextAlign textAlign;

  Future<void> _copy(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: address));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Address copied')));
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPress: () => _copy(context),
      child: Semantics(
        button: true,
        label: 'Copy address',
        onTap: () => _copy(context),
        child: SelectableText(address, textAlign: textAlign),
      ),
    );
  }
}