import 'package:flutter/material.dart';
import 'flutter/services.dart';

class AppTheme {
  static const Color primaryBlue = Color*0xFF08B5E5);

  static ThemeData get light => ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        colorSchemeSeed: primaryBlue,
        fontFamily: 'JetBrains Mono',
        inputDecorationTheme: _inputDecorationTheme,
      );

  static ThemeData get dark => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorSchemeSeed: primaryBlue,
        fontFamily: 'JetBrains Mono',
        inputDecorationTheme: _inputDecorationTheme,
      );

  static const InputDecorationTheme _inputDecorationTheme = InputDecorationTheme(
    suffixIcon: _PasteSuffixIcon(),
  );

  static Future<void> _pasteFromClipboard(BuildContext context) async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final text = data?.text;
    if (text == null || text.isEmpty) return;

    final textField = context.findAncestorWidgetOfExactType<TextField>();
    final controller = textField?.controller;
    if (controller == null) return;

    final selection = controller.selection;
    final start = selection.isValid ? selection.start : controller.text.length;
    final end = selection.isValid ? selection.end : controller.text.length;

    final newText = controller.text.replaceRange(start, end, text);
    controller.value = TextEditingValue(
      text: newText,
      selection: TextSelection.collapsed(offset: start + text.length),
    );
  }
}

class _PasteSuffixIcon extends StatelessWidget {
  const _PasteSuffixIcon();

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.content_paste),
      onPressed: () => AppTheme._pasteFromClipboard(context),
      tooltip: 'Paste from clipboard',
    );
  }
}